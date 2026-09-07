/**
 * Pipeline de ingestão: lê extratos e faturas em `docs/`, identifica a conta de
 * cada arquivo, normaliza e categoriza as transações, detecta transferências
 * entre contas e grava o resultado em `src/data/*.json`.
 *
 * Uso: `pnpm ingest`
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { ACCOUNT_PROFILES, SELF_NAME_PATTERNS, type AccountProfile } from './accounts.config.ts'
import { BUDGET } from './budget.config.ts'
import { GOALS } from './goals.config.ts'
import { PLANNED_ENTRIES } from './planned.config.ts'
import { RECEIVABLES } from './receivables.config.ts'
import { parseOfx, parseXpInvoiceCsv, type ParsedFile, type RawTransaction } from './parsers.ts'
import { readBrokerageLedger, type BrokerageLedger } from './brokerage.ts'
import { buildInvestments } from './investments.ts'
import { matchPlanned, matchReceivables, ruleProblems } from './matching.ts'
import { RULES, cleanDescription, deriveMerchant, normalizeForRules } from './rules.ts'
import { CATEGORY_MAP } from '../src/data/categories.ts'
import type { Account, DatasetMeta, PlannedEntry, Transaction, Transfer, TransferKind } from '../src/data/types.ts'

const ROOT = new URL('..', import.meta.url).pathname
const DOCS_DIR = join(ROOT, 'docs')
const OUT_DIR = join(ROOT, 'src', 'generated')

// ---------------------------------------------------------------------------
// 1. Descoberta de arquivos
// ---------------------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/**
 * Quando o mesmo documento existe em vários formatos (OFX, CSV, PDF, TXT),
 * fica só o mais rico: OFX > CSV. PDF e TXT são ignorados.
 */
function pickBestFormat(files: string[]): string[] {
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const ext = extname(file).toLowerCase()
    if (!['.ofx', '.csv'].includes(ext)) continue
    const dir = file.slice(0, file.lastIndexOf('/'))
    const stem = file
      .slice(dir.length + 1)
      .replace(ext, '')
      .replace(/-(OFX|CSV|PDF|TXT)$/i, '')
      .replace(/\s*\(\d+\)$/, '')
    const key = `${dir}/${stem}`
    groups.set(key, [...(groups.get(key) ?? []), file])
  }
  const chosen: string[] = []
  for (const group of groups.values()) {
    const ofx = group.filter((f) => f.toLowerCase().endsWith('.ofx'))
    chosen.push(...(ofx.length > 0 ? ofx : group))
  }
  return chosen.sort()
}

function parseFile(path: string): ParsedFile | null {
  const ext = extname(path).toLowerCase()
  if (ext === '.ofx') return parseOfx(path)
  if (ext === '.csv' && /fatura\/xp\//i.test(path)) return parseXpInvoiceCsv(path)
  return null
}

// ---------------------------------------------------------------------------
// 2. Identificação da conta
// ---------------------------------------------------------------------------

function matchesProfile(profile: AccountProfile, file: ParsedFile): boolean {
  const m = profile.match
  if (m.bankCode && file.bankCode !== m.bankCode) return false
  if (m.accountType && file.accountType !== m.accountType) return false
  if (m.externalId) {
    if (!file.externalId) {
      if (!m.pathIncludes) return false
    } else if (m.externalId instanceof RegExp ? !m.externalId.test(file.externalId) : file.externalId !== m.externalId) {
      return false
    }
  }
  if (m.pathIncludes && !file.path.includes(m.pathIncludes)) return false
  return true
}

const discoveredAccounts = new Map<string, AccountProfile>(ACCOUNT_PROFILES.map((p) => [p.id, p]))

function identifyAccount(file: ParsedFile): AccountProfile {
  const known = ACCOUNT_PROFILES.find((p) => matchesProfile(p, file))
  if (known) return known
  // Conta desconhecida: cria um perfil genérico a partir dos metadados do arquivo.
  const id = `${(file.bankName ?? file.bankCode ?? 'banco').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${file.accountType}-${file.externalId ?? 'x'}`
  const existing = discoveredAccounts.get(id)
  if (existing) return existing
  const profile: AccountProfile = {
    id,
    name: `${file.bankName ?? 'Banco'} ${file.accountType === 'credit-card' ? 'Cartão' : 'Conta'} ${file.externalId ?? ''}`.trim(),
    bank: file.bankName ?? 'Desconhecido',
    bankCode: file.bankCode ?? '',
    type: file.accountType,
    entity: 'PF',
    holder: '',
    match: {},
  }
  discoveredAccounts.set(id, profile)
  console.warn(`⚠️  Conta não cadastrada, criada automaticamente: ${id}`)
  return profile
}

// ---------------------------------------------------------------------------
// 3. Normalização de transações
// ---------------------------------------------------------------------------

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(d, lastDay))
  return date.toISOString().slice(0, 10)
}

function categorize(normalized: string, amount: number): { categoryId: string; rule: string | null; merchant: string | null } {
  for (const rule of RULES) {
    if (rule.sign === 'in' && amount < 0) continue
    if (rule.sign === 'out' && amount > 0) continue
    if (rule.test.test(normalized)) return { categoryId: rule.category, rule: rule.id, merchant: rule.merchant ?? null }
  }
  return { categoryId: amount > 0 ? 'reembolso' : 'outros', rule: null, merchant: null }
}

function isSelfLike(raw: string): boolean {
  return SELF_NAME_PATTERNS.some((p) => p.test(raw))
}

function buildTransaction(raw: RawTransaction, file: ParsedFile, profile: AccountProfile, ordinal: number): Transaction {
  const description = cleanDescription(raw.description)
  const normalized = normalizeForRules(description)
  const cat = categorize(normalized, raw.amount)
  const merchant = cat.merchant ?? deriveMerchant(description)
  const date = raw.installment ? addMonths(raw.postedDate, raw.installment.current - 1) : raw.postedDate
  const invoice = file.kind === 'invoice' && file.invoiceDueDate ? { dueDate: file.invoiceDueDate, month: file.invoiceDueDate.slice(0, 7) } : null
  // A FATURA entra na identidade. Uma compra parcelada aparece uma vez por fatura, e as cinco
  // aparições de `Loja Exemplo` em maio a setembro são cinco linhas legítimas — sem a fatura na
  // chave, elas colidiam num id só. O `ordinal` distingue repetições DENTRO de um arquivo;
  // ele não distingue arquivos, e é de propósito: o mesmo lançamento lido de dois extratos
  // sobrepostos precisa colidir, para a deduplicação abaixo poder descartá-lo.
  const id = createHash('sha1')
    .update([profile.id, raw.postedDate, raw.amount.toFixed(2), raw.description, raw.fitId ?? '', invoice?.month ?? '', ordinal].join('|'))
    .digest('hex')
    .slice(0, 12)
  return {
    id,
    accountId: profile.id,
    entity: profile.entity,
    date,
    postedDate: raw.postedDate,
    amount: Math.round(raw.amount * 100) / 100,
    description,
    rawDescription: raw.description,
    merchant,
    kind: file.kind,
    categoryId: cat.categoryId,
    categoryRule: cat.rule,
    installment: raw.installment,
    invoice,
    transferId: null,
    transferKind: null,
    counterpartAccountId: null,
    receivableId: null,
    plannedId: null,
    source: relative(ROOT, file.path),
    fitId: raw.fitId,
  }
}

// ---------------------------------------------------------------------------
// 4. Detecção de transferências entre contas
// ---------------------------------------------------------------------------

const TRANSFER_CATEGORIES = new Set(['transferencia', 'pagamento-fatura', 'investimentos'])

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)
}

const PIX_NO_CREDITO = /pix no cr[eé]dito/i

function transferCandidate(tx: Transaction): boolean {
  if (PIX_NO_CREDITO.test(tx.rawDescription)) return false
  return TRANSFER_CATEGORIES.has(tx.categoryId) || isSelfLike(tx.rawDescription)
}

const BANK_MENTIONS: Record<string, RegExp> = {
  '077': /\bINTER\b/i,
  '260': /\bNU\b|NUBANK|NU PAGAMENTOS/i,
  '348': /\bXP\b/i,
}

/** Contas irmãs do mesmo banco (conta corrente ↔ cartão). */
function siblingAccount(accountId: string, profiles: Map<string, AccountProfile>, type: 'checking' | 'credit-card'): string | null {
  const me = profiles.get(accountId)
  if (!me) return null
  for (const p of profiles.values()) if (p.id !== me.id && p.bankCode === me.bankCode && p.type === type) return p.id
  return null
}

function detectTransfers(transactions: Transaction[], profiles: Map<string, AccountProfile>, ledger: BrokerageLedger | null): Transfer[] {
  const transfers: Transfer[] = []
  const outflows = transactions.filter((t) => t.amount < 0 && transferCandidate(t)).sort((a, b) => a.postedDate.localeCompare(b.postedDate))
  const inflows = transactions.filter((t) => t.amount > 0 && transferCandidate(t))
  const used = new Set<string>()

  for (const out of outflows) {
    const outType = profiles.get(out.accountId)?.type
    const candidates = inflows
      .filter((inn) => !used.has(inn.id) && inn.accountId !== out.accountId && Math.abs(inn.amount + out.amount) < 0.005 && daysBetween(inn.postedDate, out.postedDate) <= 4)
      .map((inn) => {
        const inType = profiles.get(inn.accountId)?.type
        const isCardPayment = outType === 'credit-card' || inType === 'credit-card'
        const payCategories = out.categoryId === 'pagamento-fatura' || inn.categoryId === 'pagamento-fatura'
        // Pagamento de fatura precisa envolver um cartão; transferência comum não pode envolver cartão.
        if (payCategories !== isCardPayment) return null
        let score = daysBetween(inn.postedDate, out.postedDate)
        if (isCardPayment && profiles.get(inn.accountId)?.bankCode === profiles.get(out.accountId)?.bankCode) score -= 0.5
        // A descrição de um lado cita o banco do outro → par mais provável.
        const outBank = profiles.get(out.accountId)?.bankCode ?? ''
        const inBank = profiles.get(inn.accountId)?.bankCode ?? ''
        if (BANK_MENTIONS[outBank]?.test(inn.rawDescription) || BANK_MENTIONS[inBank]?.test(out.rawDescription)) score -= 0.3
        return { inn, score, isCardPayment }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.score - b.score)

    const best = candidates[0]
    if (!best) continue
    used.add(best.inn.id)
    const kind: TransferKind = best.isCardPayment ? 'card-payment' : 'internal'
    const id = `tr-${out.id}-${best.inn.id}`
    transfers.push({
      id,
      kind,
      date: out.postedDate,
      amount: -out.amount,
      fromAccountId: out.accountId,
      toAccountId: best.inn.accountId,
      fromTransactionId: out.id,
      toTransactionId: best.inn.id,
      description: out.description,
    })
    for (const tx of [out, best.inn]) {
      tx.transferId = id
      tx.transferKind = kind
      tx.categoryId = kind === 'card-payment' ? 'pagamento-fatura' : 'transferencia'
    }
    out.counterpartAccountId = best.inn.accountId
    best.inn.counterpartAccountId = out.accountId
  }

  // Aportes/resgates da conta investimento: contraparte é a conta virtual.
  for (const tx of transactions) {
    if (tx.transferId || tx.categoryId !== 'investimentos') continue
    const id = `tr-${tx.id}-invest`
    const isOut = tx.amount < 0
    transfers.push({
      id,
      kind: 'investment',
      date: tx.postedDate,
      amount: Math.abs(tx.amount),
      fromAccountId: isOut ? tx.accountId : 'xp-investimentos',
      toAccountId: isOut ? 'xp-investimentos' : tx.accountId,
      fromTransactionId: isOut ? tx.id : null,
      toTransactionId: isOut ? null : tx.id,
      description: tx.description,
    })
    tx.transferId = id
    tx.transferKind = 'investment'
    tx.counterpartAccountId = 'xp-investimentos'
  }

  // Movimentações cuja contraparte é conhecida pela própria descrição, mesmo sem
  // o outro lado no período coberto: pagamento de fatura e Pix no Crédito.
  for (const tx of transactions) {
    if (tx.transferId) continue
    const type = profiles.get(tx.accountId)?.type
    const isPayment = tx.categoryId === 'pagamento-fatura'
    const isPixCredit = PIX_NO_CREDITO.test(tx.rawDescription)
    if (!isPayment && !isPixCredit) continue
    const counterpart = siblingAccount(tx.accountId, profiles, type === 'credit-card' ? 'checking' : 'credit-card')
    if (!counterpart) continue
    const kind: TransferKind = isPayment ? 'card-payment' : 'internal'
    const id = `tr-${tx.id}-inferred`
    const isOut = tx.amount < 0
    transfers.push({
      id,
      kind,
      date: tx.postedDate,
      amount: Math.abs(tx.amount),
      fromAccountId: isOut ? tx.accountId : counterpart,
      toAccountId: isOut ? counterpart : tx.accountId,
      fromTransactionId: isOut ? tx.id : null,
      toTransactionId: isOut ? null : tx.id,
      description: `${tx.description} (contraparte inferida)`,
    })
    tx.transferId = id
    tx.transferKind = kind
    tx.counterpartAccountId = counterpart
    tx.categoryId = isPayment ? 'pagamento-fatura' : 'transferencia'
  }

  // Resgates que voltaram do caixa da corretora sem dizer que vieram dele.
  //
  // A XP devolve dinheiro para a conta corrente por dois canais, e só um se identifica: o
  // interno vira "Transferência recebida da conta investimento" e o SPB vira uma TED nominal
  // do próprio titular, indistinguível de um Pix que você mandou de outro banco. Foram
  // R$ 12.400,00 em 22 saques lidos como transferência sem contraparte — neutros no fluxo,
  // mas invisíveis como resgate, o que inflava o aporte e derrubava o rendimento para
  // negativo. Quem desempata é o razão da corretora, que registra a saída correspondente.
  if (ledger) {
    const withdrawals = ledger.entries.filter((e) => e.kind === 'bank' && e.value < 0).map((e) => ({ date: e.date, amount: -e.value, used: false }))
    for (const tx of transactions) {
      if (tx.transferId || tx.amount <= 0 || tx.counterpartAccountId) continue
      if (!isSelfLike(tx.rawDescription)) continue
      // Mesmo valor ao centavo e até 4 dias de folga, a mesma janela do pareamento entre
      // contas. Casar só por valor juntaria um resgate a um Pix seu de outro banco.
      const hit = withdrawals.find((w) => !w.used && Math.abs(w.amount - tx.amount) < 0.01 && Math.abs(Date.parse(w.date) - Date.parse(tx.date)) <= 4 * 86_400_000)
      if (!hit) continue
      hit.used = true
      const id = `tr-${tx.id}-invest`
      transfers.push({
        id,
        kind: 'investment',
        date: tx.postedDate,
        amount: tx.amount,
        fromAccountId: 'xp-investimentos',
        toAccountId: tx.accountId,
        fromTransactionId: null,
        toTransactionId: tx.id,
        description: `${tx.description} (resgate, pelo extrato da corretora)`,
      })
      tx.transferId = id
      tx.transferKind = 'investment'
      tx.counterpartAccountId = 'xp-investimentos'
      tx.categoryId = 'transferencia'
    }
  }

  // Sobras: parecem transferência própria, mas sem contraparte encontrada.
  for (const tx of transactions) {
    if (tx.transferId) continue
    if (isSelfLike(tx.rawDescription) || tx.categoryId === 'pagamento-fatura' || tx.categoryId === 'transferencia') {
      tx.transferKind = 'unmatched-self'
      if (!TRANSFER_CATEGORIES.has(tx.categoryId)) tx.categoryId = 'transferencia'
    }
  }

  return transfers
}

// ---------------------------------------------------------------------------
// 5. Execução
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Cobranças: quem te deve, e qual entrada quitou
// ---------------------------------------------------------------------------

function main() {
  const files = pickBestFormat(walk(DOCS_DIR))
  const parsed = files.map(parseFile).filter((f): f is ParsedFile => f !== null)

  // Identifica conta e descarta downloads repetidos do mesmo documento (fica o mais completo).
  type Entry = { file: ParsedFile; profile: AccountProfile }
  const byDocument = new Map<string, Entry>()
  const skipped: string[] = []
  for (const file of parsed) {
    const profile = identifyAccount(file)
    const periodKey = file.period ? `${file.period.from}..${file.period.to}` : file.canonicalName
    const key = `${profile.id}|${periodKey}`
    const current = byDocument.get(key)
    if (!current || file.transactions.length > current.file.transactions.length) {
      if (current) skipped.push(current.file.path)
      byDocument.set(key, { file, profile })
    } else {
      skipped.push(file.path)
    }
  }

  const profiles = discoveredAccounts
  const transactions: Transaction[] = []
  const sourcesByAccount = new Map<string, string[]>()
  const balanceByAccount = new Map<string, { amount: number; asOf: string }>()

  for (const { file, profile } of byDocument.values()) {
    const seen = new Map<string, number>()
    for (const raw of file.transactions) {
      const dupKey = `${raw.postedDate}|${raw.amount}|${raw.description}|${raw.fitId ?? ''}`
      const ordinal = seen.get(dupKey) ?? 0
      seen.set(dupKey, ordinal + 1)
      transactions.push(buildTransaction(raw, file, profile, ordinal))
    }
    sourcesByAccount.set(profile.id, [...(sourcesByAccount.get(profile.id) ?? []), relative(ROOT, file.path)])
    if (file.balance) {
      const current = balanceByAccount.get(profile.id)
      if (!current || file.balance.asOf > current.asOf) balanceByAccount.set(profile.id, file.balance)
    }
  }

  // Extratos com períodos SOBREPOSTOS trazem o mesmo lançamento duas vezes — o de 01/04 a
  // 30/06 e o de 01/06 a 30/08 repetem junho inteiro. Como o id não conhece o arquivo, o
  // repetido colide com o original e é descartado aqui. Repetição dentro de UM arquivo
  // sobrevive: ali o `ordinal` já deu ids diferentes.
  const seenTransactionIds = new Set<string>()
  const duplicated: Transaction[] = []
  const unique: Transaction[] = []
  for (const tx of transactions) {
    if (seenTransactionIds.has(tx.id)) duplicated.push(tx)
    else {
      seenTransactionIds.add(tx.id)
      unique.push(tx)
    }
  }
  transactions.length = 0
  transactions.push(...unique)

  const investmentsDir = join(ROOT, 'docs', 'investimentos')
  const brokerage = existsSync(investmentsDir) ? readBrokerageLedger(investmentsDir) : null
  const transfers = detectTransfers(transactions, profiles, brokerage)
  const receivableMatches = matchReceivables(transactions, RECEIVABLES)
  const plannedMatches = matchPlanned(transactions, PLANNED_ENTRIES)
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id))

  const accounts: Account[] = [...profiles.values()].map((p) => {
    const own = transactions.filter((t) => t.accountId === p.id)
    const dates = own.map((t) => t.postedDate).sort()
    return {
      id: p.id,
      name: p.name,
      bank: p.bank,
      bankCode: p.bankCode,
      type: p.type,
      entity: p.entity,
      holder: p.holder,
      externalId: typeof p.match.externalId === 'string' && !p.match.externalId.startsWith('__') ? p.match.externalId : (byDocument.values().find((e) => e.profile.id === p.id)?.file.externalId ?? ''),
      coverage: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      reportedBalance: balanceByAccount.get(p.id) ?? null,
      sources: sourcesByAccount.get(p.id) ?? [],
      transactionCount: own.length,
    }
  })

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort()
  const meta: DatasetMeta = {
    generatedAt: new Date().toISOString(),
    sourceFiles: [
      ...[...byDocument.values()].map(({ file, profile }) => ({ path: relative(ROOT, file.path), account: profile.id, transactions: file.transactions.length, skippedAsDuplicate: false })),
      ...skipped.map((path) => ({ path: relative(ROOT, path), account: '', transactions: 0, skippedAsDuplicate: true })),
    ].sort((a, b) => a.path.localeCompare(b.path)),
    totals: { transactions: transactions.length, transfers: transfers.length, accounts: accounts.length },
    months,
  }

  // ---- Lançamentos previstos: validados aqui para o erro aparecer no terminal,
  // não como número estranho num gráfico.
  const plannedProblems: string[] = []
  const seenIds = new Set<string>()
  for (const entry of PLANNED_ENTRIES) {
    const where = entry.id || '(sem id)'
    if (!entry.id) plannedProblems.push('regra sem id')
    else if (seenIds.has(entry.id)) plannedProblems.push(`${where}: id repetido`)
    seenIds.add(entry.id)
    if (!entry.label.trim()) plannedProblems.push(`${where}: sem descrição`)
    if (!(entry.amount > 0)) plannedProblems.push(`${where}: valor precisa ser maior que zero`)
    if (!/^\d{4}-\d{2}$/.test(entry.startMonth)) plannedProblems.push(`${where}: startMonth "${entry.startMonth}" não é AAAA-MM`)
    const category = CATEGORY_MAP[entry.categoryId]
    if (!category) plannedProblems.push(`${where}: categoria "${entry.categoryId}" não existe`)
    else if (category.kind !== entry.kind) plannedProblems.push(`${where}: categoria "${entry.categoryId}" é de ${category.kind}, mas a regra é de ${entry.kind}`)
    if (entry.recurrence === 'installments' && !(entry.count && entry.count > 0)) plannedProblems.push(`${where}: parcelas sem count`)
    if (entry.recurrence === 'monthly' && entry.endMonth && entry.endMonth < entry.startMonth) plannedProblems.push(`${where}: endMonth antes de startMonth`)
    for (const month of Object.keys(entry.exceptions ?? {})) {
      if (!/^\d{4}-\d{2}$/.test(month)) plannedProblems.push(`${where}: exceção "${month}" não é AAAA-MM`)
    }
    // O dia é o que autoriza o mês em curso a mostrar o que ainda vence nele; um número
    // fora da faixa passaria silencioso e a ocorrência cairia no dia errado.
    if (entry.dueOn?.kind === 'day' && !(Number.isInteger(entry.dueOn.day) && entry.dueOn.day >= 1 && entry.dueOn.day <= 31)) {
      plannedProblems.push(`${where}: dueOn.day precisa ser um inteiro de 1 a 31`)
    }
    if (entry.dueOn?.kind === 'business-day' && !(Number.isInteger(entry.dueOn.nth) && entry.dueOn.nth >= 1 && entry.dueOn.nth <= 18)) {
      plannedProblems.push(`${where}: dueOn.nth precisa ser um inteiro de 1 a 18 (nenhum mês tem mais dias úteis que isso)`)
    }
    if (entry.match) {
      plannedProblems.push(...ruleProblems(where, entry.match))
      if (entry.match.accountId && !profiles.has(entry.match.accountId)) plannedProblems.push(`${where}: conta "${entry.match.accountId}" não existe`)
      // Conciliar sem dia deixaria "atrasado" indistinguível de "ainda vai vencer".
      if (!entry.dueOn) plannedProblems.push(`${where}: regra com match precisa de dueOn, senão não há como dizer se atrasou`)
    }
  }
  const planned: PlannedEntry[] = PLANNED_ENTRIES.map((e) => ({ ...e, exceptions: e.exceptions ?? {} }))

  // ---- Cobranças: mesma validação, mesmo motivo. Uma categoria de entrada aqui abateria
  // a coisa errada, e um `matchMerchant` minúsculo nunca casaria nada em silêncio.
  const receivableProblems: string[] = [...receivableMatches.conflicts]
  const seenReceivableIds = new Set<string>()
  for (const receivable of RECEIVABLES) {
    const where = receivable.id || '(sem id)'
    if (!receivable.id) receivableProblems.push('cobrança sem id')
    else if (seenReceivableIds.has(receivable.id)) receivableProblems.push(`${where}: id repetido`)
    seenReceivableIds.add(receivable.id)
    if (!receivable.debtor.trim()) receivableProblems.push(`${where}: sem devedor`)
    if (!(receivable.amount > 0)) receivableProblems.push(`${where}: valor precisa ser maior que zero`)
    if (!/^\d{4}-\d{2}$/.test(receivable.startMonth)) receivableProblems.push(`${where}: startMonth "${receivable.startMonth}" não é AAAA-MM`)
    if (receivable.endMonth && receivable.endMonth < receivable.startMonth) receivableProblems.push(`${where}: endMonth antes de startMonth`)
    if (receivable.match.accountId && !profiles.has(receivable.match.accountId)) receivableProblems.push(`${where}: conta "${receivable.match.accountId}" não existe`)
    receivableProblems.push(...ruleProblems(where, receivable.match))
    const offset = CATEGORY_MAP[receivable.offsetsCategoryId]
    if (!offset) receivableProblems.push(`${where}: categoria "${receivable.offsetsCategoryId}" não existe`)
    else if (offset.kind !== 'expense') receivableProblems.push(`${where}: "${receivable.offsetsCategoryId}" é categoria de entrada — uma cobrança abate DESPESA`)
    if (receivable.dueOn.kind === 'day' && !(Number.isInteger(receivable.dueOn.day) && receivable.dueOn.day >= 1 && receivable.dueOn.day <= 31)) {
      receivableProblems.push(`${where}: dueOn.day precisa ser um inteiro de 1 a 31`)
    }
    if (receivable.dueOn.kind === 'business-day' && !(Number.isInteger(receivable.dueOn.nth) && receivable.dueOn.nth >= 1 && receivable.dueOn.nth <= 18)) {
      receivableProblems.push(`${where}: dueOn.nth precisa ser um inteiro de 1 a 18`)
    }
  }

  // Metas: mesma validação das regras de previsão, pelo mesmo motivo — o config é escrito à
  // mão e um erro aqui só apareceria como cartão torto na tela.
  const goalProblems: string[] = []
  const seenGoals = new Set<string>()
  for (const goal of GOALS) {
    const where = `meta "${goal.id || '(sem id)'}"`
    if (!goal.id) goalProblems.push('meta sem id')
    else if (seenGoals.has(goal.id)) goalProblems.push(`${where}: id repetido`)
    seenGoals.add(goal.id)
    if (!goal.label.trim()) goalProblems.push(`${where}: sem rótulo`)
    if (!(goal.target > 0)) goalProblems.push(`${where}: alvo precisa ser maior que zero`)
    if (goal.saved < 0) goalProblems.push(`${where}: guardado não pode ser negativo`)
    if (goal.saved > goal.target) goalProblems.push(`${where}: guardado passou do alvo — a meta já foi batida?`)
    if (!/^\d{4}-\d{2}$/.test(goal.targetMonth)) goalProblems.push(`${where}: targetMonth "${goal.targetMonth}" não é AAAA-MM`)
    if (!(goal.slot >= 1 && goal.slot <= 8)) goalProblems.push(`${where}: slot ${goal.slot} fora de 1..8`)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'accounts.json'), JSON.stringify(accounts, null, 2))
  writeFileSync(join(OUT_DIR, 'transactions.json'), JSON.stringify(transactions, null, 2))
  writeFileSync(join(OUT_DIR, 'transfers.json'), JSON.stringify(transfers, null, 2))
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
  writeFileSync(join(OUT_DIR, 'planned.json'), JSON.stringify(planned, null, 2))
  writeFileSync(join(OUT_DIR, 'goals.json'), JSON.stringify(GOALS, null, 2))
  writeFileSync(join(OUT_DIR, 'budget.json'), JSON.stringify(BUDGET, null, 2))
  writeFileSync(join(OUT_DIR, 'receivables.json'), JSON.stringify(RECEIVABLES, null, 2))

  // ---- Investimentos: a carteira reconstruída a partir dos relatórios da B3 e do razão da
  // corretora. O aporte NÃO sai daqui: sai do extrato da corretora, que é o único que vê as
  // duas pontas. Derivá-lo das transações desta base — como já foi feito — superestimava em
  // R$ 12.400,00, porque nem todo resgate se declara resgate no extrato bancário.
  const investments = existsSync(investmentsDir) ? buildInvestments(investmentsDir) : null
  writeFileSync(
    join(OUT_DIR, 'investments.json'),
    JSON.stringify(investments ? { snapshot: investments.snapshot, series: investments.series, income: investments.income } : { snapshot: null, series: [], income: [] }, null, 2),
  )

  // Relatório
  console.log(`Arquivos lidos: ${byDocument.size} (ignorados como duplicados: ${skipped.length})`)
  if (duplicated.length) {
    const porConta = new Map<string, number>()
    for (const tx of duplicated) porConta.set(tx.accountId, (porConta.get(tx.accountId) ?? 0) + 1)
    console.log(`Lançamentos repetidos descartados: ${duplicated.length} (períodos sobrepostos entre arquivos)`)
    for (const [conta, n] of porConta) console.log(`  · ${conta.padEnd(38)} ${n}`)
  }
  for (const s of skipped) console.log(`  · duplicado: ${relative(ROOT, s)}`)
  console.log(`Contas: ${accounts.length}`)
  for (const a of accounts) console.log(`  · ${a.id.padEnd(18)} ${String(a.transactionCount).padStart(4)} transações  ${a.coverage ? `${a.coverage.from} → ${a.coverage.to}` : '(virtual)'}`)
  console.log(`Transações: ${transactions.length}  |  Transferências: ${transfers.length}`)
  const unmatched = transactions.filter((t) => t.transferKind === 'unmatched-self')
  console.log(`Transferências sem contraparte: ${unmatched.length}`)
  for (const t of unmatched) console.log(`  · ${t.date} ${t.accountId.padEnd(14)} ${t.amount.toFixed(2).padStart(10)}  ${t.description}`)
  const uncategorized = transactions.filter((t) => t.categoryId === 'outros' || (t.categoryId === 'reembolso' && !t.categoryRule))
  console.log(`Sem categoria específica: ${uncategorized.length}`)
  for (const t of uncategorized) console.log(`  · ${t.date} ${t.accountId.padEnd(14)} ${t.amount.toFixed(2).padStart(10)}  ${t.description}`)
  console.log(`Lançamentos previstos: ${planned.length} (scripts/planned.config.ts)`)
  for (const e of planned) {
    const when =
      e.recurrence === 'installments'
        ? `${e.count}x a partir de ${e.startMonth}`
        : e.recurrence === 'once'
          ? `uma vez em ${e.startMonth}`
          : `todo mês de ${e.startMonth}${e.endMonth ? ` a ${e.endMonth}` : ' em diante'}`
    const day = e.dueOn ? (e.dueOn.kind === 'business-day' ? `, ${e.dueOn.nth}º dia útil` : `, dia ${e.dueOn.day}`) : ''
    const exceptions = Object.entries(e.exceptions ?? {})
    console.log(
      `  · ${e.entity} ${(e.kind === 'income' ? 'entrada' : 'saída').padEnd(7)} ${e.amount.toFixed(2).padStart(10)}  ${e.label.padEnd(28)} ${when}${day}` +
        (exceptions.length ? `  [exceções: ${exceptions.map(([m, v]) => `${m}=${v.toFixed(2)}`).join(', ')}]` : ''),
    )
  }
  const conciliated = PLANNED_ENTRIES.filter((e) => e.match)
  if (conciliated.length) {
    console.log(`  conciliadas com o extrato: ${conciliated.length} de ${PLANNED_ENTRIES.length}`)
    for (const entry of conciliated) {
      const match = plannedMatches.matches.find((m) => m.plannedId === entry.id)
      const missing = match ? match.months.filter((month) => !match.matched.includes(month)) : []
      console.log(`      ${entry.label.padEnd(28)} ${match?.matched.length ?? 0}/${match?.months.length ?? 0} meses cumpridos, total ${(match?.total ?? 0).toFixed(2)}`)
      if (missing.length) console.warn(`      ⚠️  sem lançamento em: ${missing.join(', ')}`)
    }
  }
  plannedProblems.push(...plannedMatches.conflicts)
  if (plannedProblems.length) {
    console.warn(`⚠️  Problemas nas regras de previsão: ${plannedProblems.length}`)
    for (const p of plannedProblems) console.warn(`  · ${p}`)
  }
  console.log(`Cobranças: ${RECEIVABLES.length} (scripts/receivables.config.ts)`)
  for (const receivable of RECEIVABLES) {
    const match = receivableMatches.matches.find((m) => m.receivableId === receivable.id)
    const months = match?.months.length ?? 0
    const matched = match?.matched.length ?? 0
    const missing = match ? match.months.filter((month) => !match.matched.includes(month)) : []
    const isPlan = receivable.recurrence !== 'monthly'
    const count = Math.max(1, receivable.count ?? 1)
    const window = isPlan ? `${count}x de ${receivable.startMonth}` : `${receivable.startMonth}${receivable.endMonth ? ` a ${receivable.endMonth}` : ' em diante'}`
    const received = match?.received ?? 0
    // Numa parcelada não faz sentido contar "meses casados": o dinheiro abate a próxima
    // parcela em aberto, e duas parcelas podem vir num Pix só.
    const progress = isPlan
      ? `${Math.floor(received / receivable.amount + 0.005)}/${count} parcelas cobertas, recebido ${received.toFixed(2)} de ${(receivable.amount * count).toFixed(2)}`
      : `${matched}/${months} meses casados, recebido ${received.toFixed(2)}`
    console.log(`  · ${receivable.debtor.padEnd(28)} ${receivable.amount.toFixed(2).padStart(9)}${isPlan ? '/parc' : '/mês '}  ${window.padEnd(22)} ${progress}`)
    const others = [...(match?.payers ?? [])].filter((payer) => payer !== receivable.debtor)
    if (others.length) console.log(`      pago também por: ${others.join(', ')}`)
    if (!isPlan && missing.length) console.warn(`      ⚠️  sem contraparte em: ${missing.join(', ')}`)
  }
  if (receivableProblems.length) {
    console.warn(`⚠️  Problemas nas cobranças: ${receivableProblems.length}`)
    for (const problem of receivableProblems) console.warn(`  · ${problem}`)
  }
  if (investments) {
    const last = investments.series.at(-1)
    console.log(
      `Investimentos: posição de ${investments.snapshot.asOf} — ${investments.snapshot.holdings.length} papéis, ${investments.snapshot.total.toFixed(2)} + caixa ${investments.snapshot.cash.toFixed(2)}`,
    )
    if (investments.ledger) console.log(`  · razão da corretora: ${investments.ledger.entries.length} lançamentos em ${investments.ledger.source.length} arquivos, saldo conferido`)
    if (last)
      console.log(
        `  · aportado líquido ${last.contributed.toFixed(2)} | patrimônio ${last.total.toFixed(2)} | rendimento ${(last.total - last.contributed).toFixed(2)} | série de ${investments.series.length} meses`,
      )
    for (const p of investments.problems) console.warn(`  ⚠️  ${p}`)
  } else {
    console.log('Investimentos: nenhum relatório em docs/investimentos/')
  }
  console.log(`Metas: ${GOALS.length} (scripts/goals.config.ts)`)
  for (const g of GOALS) {
    const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0
    console.log(`  · ${g.label.padEnd(28)} ${g.saved.toFixed(2)} de ${g.target.toFixed(2)}  (${pct}%)  até ${g.targetMonth}`)
  }
  if (goalProblems.length) {
    console.warn(`⚠️  Problemas nas metas: ${goalProblems.length}`)
    for (const p of goalProblems) console.warn(`  · ${p}`)
  }
  console.log(`Teto de gastos: ${BUDGET.monthlyLimit.toFixed(2)}/mês, avisando a partir de ${Math.round(BUDGET.warnAt * 100)}% (scripts/budget.config.ts)`)
  if (!(BUDGET.monthlyLimit > 0)) console.warn('⚠️  Teto de gastos precisa ser maior que zero')
  if (!(BUDGET.warnAt > 0 && BUDGET.warnAt <= 1)) console.warn('⚠️  `warnAt` do teto precisa estar entre 0 e 1')
  const rubricas = BUDGET.byCategory ?? []
  if (rubricas.length) {
    const seenCategories = new Set<string>()
    let declared = 0
    for (const rubrica of rubricas) {
      declared += rubrica.amount
      const category = CATEGORY_MAP[rubrica.categoryId]
      if (!category) console.warn(`⚠️  Rubrica: categoria "${rubrica.categoryId}" não existe`)
      else if (category.kind !== 'expense') console.warn(`⚠️  Rubrica: "${rubrica.categoryId}" é categoria de entrada — rubrica é de gasto`)
      if (seenCategories.has(rubrica.categoryId)) console.warn(`⚠️  Rubrica: categoria "${rubrica.categoryId}" declarada duas vezes`)
      seenCategories.add(rubrica.categoryId)
      if (!(rubrica.amount > 0)) console.warn(`⚠️  Rubrica "${rubrica.categoryId}": valor precisa ser maior que zero`)
      console.log(`  · ${(category?.label ?? rubrica.categoryId).padEnd(28)} ${rubrica.amount.toFixed(2).padStart(9)}/mês`)
    }
    // Rubricas acima do teto global não são erro — o teto cobre categoria não declarada
    // também —, mas se a soma já o ultrapassa, o teto nasce estourado e vale avisar.
    if (declared > BUDGET.monthlyLimit) console.warn(`⚠️  As rubricas somam ${declared.toFixed(2)}, acima do teto global de ${BUDGET.monthlyLimit.toFixed(2)}`)
  }
  const byCat = new Map<string, number>()
  for (const t of transactions) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + 1)
  console.log('Por categoria:')
  for (const [id, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  · ${(CATEGORY_MAP[id]?.label ?? id).padEnd(28)} ${n}`)
}

main()
