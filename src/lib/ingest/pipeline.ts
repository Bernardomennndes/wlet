import { CATEGORY_MAP } from '@/data/categories'
import type { Account, Budget, DatasetMeta, Goal, PlannedEntry, Receivable, Transaction, Transfer, TransferKind, Trip, TripCost } from '@/data/types'
import { readBrokerageLedger, type BrokerageLedger } from './brokerage'
import type { IngestEnv, SourceFile } from './io'
import { buildInvestments, type CdiDay } from './investments'
import { matchPlanned, matchReceivables, ruleProblems } from './matching'
import { canonicalName, parseNubankInvoicePdf, parseOfx, parseXpInvoiceCsv, type ParsedFile, type RawTransaction } from './parsers'
import { readPdfLines } from './pdf'
import { cleanDescription, deriveMerchant, normalizeForRules, type Rule } from './rules'

/**
 * O pipeline de ingestão — UMA implementação, dois ambientes.
 *
 * Era `scripts/ingest.ts`, que lia `docs/` do disco, importava sete `*.config.ts` e escrevia
 * JSON. Nada disso existe no navegador, e reescrevê-lo lá produziria duas versões do mesmo
 * casamento e da mesma categorização, que divergiriam no primeiro ajuste — o argumento que o
 * projeto já aplica a `settlement.ts`.
 *
 * Então o núcleo não busca nada: RECEBE os arquivos já lidos, as configurações e o ambiente, e
 * DEVOLVE o conjunto pronto mais um relatório. Quem tem disco escreve arquivo; quem tem
 * IndexedDB grava lá; quem tem terminal imprime o relatório. O `scripts/ingest.ts` de hoje é a
 * casca de Node em cima disto.
 */
export interface AccountProfile {
  id: string
  name: string
  bank: string
  bankCode: string
  type: 'checking' | 'credit-card' | 'investment'
  entity: 'PF' | 'PJ'
  holder: string
  match: {
    bankCode?: string
    externalId?: string | RegExp
    accountType?: 'checking' | 'credit-card' | 'investment'
    pathIncludes?: string
  }
}

export interface IngestInput {
  sources: SourceFile[]
  accounts: AccountProfile[]
  selfNamePatterns: readonly RegExp[]
  /** Já concatenadas nas três camadas: prioridade → suas → genéricas. */
  rules: Rule[]
  planned: PlannedEntry[]
  receivables: Receivable[]
  budget: Budget
  goals: Goal[]
  trips: Trip[]
  tripExcludedCategories: readonly string[]
  /**
   * O instante da geração, INJETADO.
   *
   * `meta.generatedAt` saía de `new Date()` dentro do pipeline, e isso tornava a saída
   * impossível de comparar entre duas rodadas: o mesmo `docs/` produzia dois JSON diferentes.
   * Recebendo o instante, o núcleo vira determinístico e a conferência "mesmo docs, mesmo
   * resultado" passa a ser executável.
   */
  now: string
  cdi?: CdiDay[]
  env: IngestEnv
}

export interface IngestReport {
  filesRead: number
  skipped: string[]
  duplicated: { accountId: string; count: number }[]
  pdfProblems: string[]
  unknownAccounts: string[]
  plannedProblems: string[]
  receivableProblems: string[]
  goalProblems: string[]
  brokerageProblems: string[]
  investmentProblems: string[]
  unmatchedTransfers: Transaction[]
  uncategorized: Transaction[]
}

export interface IngestResult {
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  meta: DatasetMeta
  planned: PlannedEntry[]
  goals: Goal[]
  budget: Budget
  receivables: Receivable[]
  trips: TripCost[]
  investments: { snapshot: unknown; series: unknown[]; income: unknown[] }
  report: IngestReport
}

// ---------------------------------------------------------------------------
// 1. Descoberta de arquivos
// ---------------------------------------------------------------------------

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return dot > slash ? path.slice(dot).toLowerCase() : ''
}

/**
 * Quando o mesmo documento existe em vários formatos, fica só o mais rico: OFX > CSV > PDF.
 * TXT continua ignorado.
 *
 * PDF é ÚLTIMO recurso de propósito: ele é layout, não dado, e o leitor reconstrói a linha por
 * posição. Existe porque o Nubank não publica OFX nem CSV para faturas anteriores a 2024 —
 * três anos de histórico que só existem assim. Onde há OFX, o PDF nem é lido.
 */
export function pickBestFormat(sources: SourceFile[]): SourceFile[] {
  const groups = new Map<string, SourceFile[]>()
  for (const file of sources) {
    const ext = extensionOf(file.path)
    if (!['.ofx', '.csv', '.pdf'].includes(ext)) continue
    const dir = file.path.slice(0, file.path.lastIndexOf('/'))
    const stem = file.path
      .slice(dir.length + 1)
      .replace(ext, '')
      .replace(/-(OFX|CSV|PDF|TXT)$/i, '')
      .replace(/\s*\(\d+\)$/, '')
    const key = `${dir}/${stem}`
    groups.set(key, [...(groups.get(key) ?? []), file])
  }
  const chosen: SourceFile[] = []
  for (const group of groups.values()) {
    const ofx = group.filter((f) => f.path.toLowerCase().endsWith('.ofx'))
    if (ofx.length > 0) {
      chosen.push(...ofx)
      continue
    }
    const csv = group.filter((f) => f.path.toLowerCase().endsWith('.csv'))
    chosen.push(...(csv.length > 0 ? csv : group))
  }
  return chosen.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

async function parseFile(file: SourceFile, input: IngestInput, pdfProblems: string[]): Promise<ParsedFile | null> {
  const ext = extensionOf(file.path)
  if (ext === '.ofx') return parseOfx(file)
  if (ext === '.csv' && /fatura\/xp\//i.test(file.path)) return parseXpInvoiceCsv(file, input.selfNamePatterns)
  if (ext === '.pdf' && /fatura\/nubank\//i.test(file.path)) {
    const parsed = await parseNubankInvoicePdf(file, input.env, readPdfLines)
    // Fatura que não fecha é RECUSADA, não importada com aviso. Dado de PDF que não confere
    // com o total impresso é dado errado, e errado em silêncio é pior que ausente.
    if (parsed.problem) {
      pdfProblems.push(`${file.path}: ${parsed.problem}`)
      return null
    }
    return parsed
  }
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

function categorize(rules: Rule[], normalized: string, amount: number): { categoryId: string; rule: string | null; merchant: string | null } {
  for (const rule of rules) {
    if (rule.sign === 'in' && amount < 0) continue
    if (rule.sign === 'out' && amount > 0) continue
    if (rule.test.test(normalized)) return { categoryId: rule.category, rule: rule.id, merchant: rule.merchant ?? null }
  }
  return { categoryId: amount > 0 ? 'reembolso' : 'outros', rule: null, merchant: null }
}

const TRANSFER_CATEGORIES = new Set(['transferencia', 'pagamento-fatura', 'investimentos'])
const PIX_NO_CREDITO = /pix no cr[eé]dito/i
const BANK_MENTIONS: Record<string, RegExp> = {
  '077': /\bINTER\b/i,
  '260': /\bNU\b|NUBANK|NU PAGAMENTOS/i,
  '348': /\bXP\b/i,
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)
}

/** Contas irmãs do mesmo banco (conta corrente ↔ cartão). */
function siblingAccount(accountId: string, profiles: Map<string, AccountProfile>, type: 'checking' | 'credit-card'): string | null {
  const me = profiles.get(accountId)
  if (!me) return null
  for (const p of profiles.values()) if (p.id !== me.id && p.bankCode === me.bankCode && p.type === type) return p.id
  return null
}

function detectTransfers(transactions: Transaction[], profiles: Map<string, AccountProfile>, ledger: BrokerageLedger | null, isSelfLike: (raw: string) => boolean): Transfer[] {
  const transferCandidate = (tx: Transaction): boolean => {
    if (PIX_NO_CREDITO.test(tx.rawDescription)) return false
    return TRANSFER_CATEGORIES.has(tx.categoryId) || isSelfLike(tx.rawDescription)
  }

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
  // do próprio titular, indistinguível de um Pix que você mandou de outro banco. Quem
  // desempata é o razão da corretora, que registra a saída correspondente.
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
// 4. Execução
// ---------------------------------------------------------------------------

export async function runIngest(input: IngestInput): Promise<IngestResult> {
  const { env } = input
  const isSelfLike = (raw: string): boolean => input.selfNamePatterns.some((p) => p.test(raw))

  const pdfProblems: string[] = []
  const unknownAccounts: string[] = []
  const chosen = pickBestFormat(input.sources)
  const parsed = (await Promise.all(chosen.map((file) => parseFile(file, input, pdfProblems)))).filter((f): f is ParsedFile => f !== null)

  const profiles = new Map<string, AccountProfile>(input.accounts.map((p) => [p.id, p]))

  function identifyAccount(file: ParsedFile): AccountProfile {
    const known = input.accounts.find((p) => matchesProfile(p, file))
    if (known) return known
    // Conta desconhecida: cria um perfil genérico a partir dos metadados do arquivo.
    const id = `${(file.bankName ?? file.bankCode ?? 'banco').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${file.accountType}-${file.externalId ?? 'x'}`
    const existing = profiles.get(id)
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
    profiles.set(id, profile)
    // Vai para o RELATÓRIO e não para o console: quem roda no navegador não tem terminal, e
    // um aviso que só existe em `console.warn` desaparece para quem mais precisa dele.
    unknownAccounts.push(id)
    return profile
  }

  // Identifica conta e descarta downloads repetidos do mesmo documento (fica o mais completo).
  type Entry = { file: ParsedFile; profile: AccountProfile }
  const byDocument = new Map<string, Entry>()
  const skipped: string[] = []
  for (const file of parsed) {
    const profile = identifyAccount(file)
    const periodKey = file.period ? `${file.period.from}..${file.period.to}` : (file.canonicalName ?? canonicalName(file.path))
    const key = `${profile.id}|${periodKey}`
    const current = byDocument.get(key)
    if (!current || file.transactions.length > current.file.transactions.length) {
      if (current) skipped.push(current.file.path)
      byDocument.set(key, { file, profile })
    } else {
      skipped.push(file.path)
    }
  }

  const transactions: Transaction[] = []
  const sourcesByAccount = new Map<string, string[]>()
  const balanceByAccount = new Map<string, { amount: number; asOf: string }>()

  function buildTransaction(raw: RawTransaction, file: ParsedFile, profile: AccountProfile, ordinal: number): Transaction {
    const description = cleanDescription(raw.description)
    const normalized = normalizeForRules(description)
    const cat = categorize(input.rules, normalized, raw.amount)
    const merchant = cat.merchant ?? deriveMerchant(description)
    const date = raw.installment ? addMonths(raw.postedDate, raw.installment.current - 1) : raw.postedDate
    const invoice = file.kind === 'invoice' && file.invoiceDueDate ? { dueDate: file.invoiceDueDate, month: file.invoiceDueDate.slice(0, 7) } : null
    // A FATURA entra na identidade. Uma compra parcelada aparece uma vez por fatura, e cinco
    // aparições do mesmo estabelecimento em cinco meses são cinco linhas legítimas — sem a
    // fatura na chave, elas colidiam num id só. O `ordinal` distingue repetições DENTRO de um
    // arquivo; ele não distingue arquivos, e é de propósito: o mesmo lançamento lido de dois
    // extratos sobrepostos precisa colidir, para a deduplicação abaixo poder descartá-lo.
    const id = env.shortId([profile.id, raw.postedDate, raw.amount.toFixed(2), raw.description, raw.fitId ?? '', invoice?.month ?? '', ordinal].join('|'))
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
      source: file.path,
      fitId: raw.fitId,
    }
  }

  for (const { file, profile } of byDocument.values()) {
    const seen = new Map<string, number>()
    for (const raw of file.transactions) {
      const dupKey = `${raw.postedDate}|${raw.amount}|${raw.description}|${raw.fitId ?? ''}`
      const ordinal = seen.get(dupKey) ?? 0
      seen.set(dupKey, ordinal + 1)
      transactions.push(buildTransaction(raw, file, profile, ordinal))
    }
    sourcesByAccount.set(profile.id, [...(sourcesByAccount.get(profile.id) ?? []), file.path])
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
  const duplicatedByAccount = new Map<string, number>()
  const unique: Transaction[] = []
  for (const tx of transactions) {
    if (seenTransactionIds.has(tx.id)) duplicatedByAccount.set(tx.accountId, (duplicatedByAccount.get(tx.accountId) ?? 0) + 1)
    else {
      seenTransactionIds.add(tx.id)
      unique.push(tx)
    }
  }
  transactions.length = 0
  transactions.push(...unique)

  const brokerage = await readBrokerageLedger(input.sources, env)
  const transfers = detectTransfers(transactions, profiles, brokerage, isSelfLike)
  const receivableMatches = matchReceivables(transactions, input.receivables)
  matchPlanned(transactions, input.planned)
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
      externalId:
        typeof p.match.externalId === 'string' && !p.match.externalId.startsWith('__') ? p.match.externalId : ([...byDocument.values()].find((e) => e.profile.id === p.id)?.file.externalId ?? ''),
      coverage: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      reportedBalance: balanceByAccount.get(p.id) ?? null,
      sources: sourcesByAccount.get(p.id) ?? [],
      transactionCount: own.length,
    }
  })

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort()
  const meta: DatasetMeta = {
    generatedAt: input.now,
    sourceFiles: [
      ...[...byDocument.values()].map(({ file, profile }) => ({ path: file.path, account: profile.id, transactions: file.transactions.length, skippedAsDuplicate: false })),
      ...skipped.map((path) => ({ path, account: '', transactions: 0, skippedAsDuplicate: true })),
    ].sort((a, b) => a.path.localeCompare(b.path)),
    totals: { transactions: transactions.length, transfers: transfers.length, accounts: accounts.length },
    months,
  }

  // ---- Lançamentos previstos: validados aqui para o erro aparecer no relatório, não como
  // número estranho num gráfico.
  const plannedProblems: string[] = []
  const seenIds = new Set<string>()
  for (const entry of input.planned) {
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
  const planned: PlannedEntry[] = input.planned.map((e) => ({ ...e, exceptions: e.exceptions ?? {} }))

  // ---- Cobranças: mesma validação, mesmo motivo. Uma categoria de entrada aqui abateria
  // a coisa errada, e um `matchMerchant` minúsculo nunca casaria nada em silêncio.
  const receivableProblems: string[] = [...receivableMatches.conflicts]
  const seenReceivableIds = new Set<string>()
  for (const receivable of input.receivables) {
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
  for (const goal of input.goals) {
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

  // ---- Viagens: a data você declara, o custo o app calcula.
  //
  // As contas fixas saem da soma. Sem isso, um fim de semana fora que cai no dia do aluguel
  // herda o aluguel inteiro e vira a viagem mais cara do ano.
  const excluded = new Set([...input.tripExcludedCategories, 'transferencia', 'pagamento-fatura', 'investimentos'])
  const trips: TripCost[] = input.trips
    .map((trip) => {
      const inWindow = transactions.filter((tx) => tx.amount < 0 && tx.date >= trip.from && tx.date <= trip.to && !excluded.has(tx.categoryId))
      const spent = Math.round(inWindow.reduce((sum, tx) => sum - tx.amount, 0) * 100) / 100
      const days = Math.round((Date.parse(trip.to) - Date.parse(trip.from)) / 86_400_000) + 1
      return { ...trip, days, spent, perDay: Math.round((spent / days) * 100) / 100, transactions: inWindow.length }
    })
    .sort((a, b) => a.from.localeCompare(b.from))

  // ---- Investimentos: a carteira reconstruída a partir dos relatórios da B3 e do razão da
  // corretora. O aporte NÃO sai daqui: sai do extrato da corretora, que é o único que vê as
  // duas pontas.
  const investments = await buildInvestments(input.sources, env, input.cdi)

  return {
    accounts,
    transactions,
    transfers,
    meta,
    planned,
    goals: input.goals,
    budget: input.budget,
    receivables: input.receivables,
    trips,
    investments: investments ? { snapshot: investments.snapshot, series: investments.series, income: investments.income } : { snapshot: null, series: [], income: [] },
    report: {
      filesRead: byDocument.size,
      skipped,
      duplicated: [...duplicatedByAccount].map(([accountId, count]) => ({ accountId, count })),
      pdfProblems,
      unknownAccounts,
      plannedProblems,
      receivableProblems,
      goalProblems,
      brokerageProblems: brokerage?.problems ?? [],
      investmentProblems: investments?.problems ?? [],
      unmatchedTransfers: transactions.filter((t) => t.transferKind === 'unmatched-self'),
      uncategorized: transactions.filter((t) => t.categoryId === 'outros' || t.categoryId === 'reembolso'),
    },
  }
}
