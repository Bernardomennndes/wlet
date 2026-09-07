/**
 * Casamento de regra declarada contra o extrato — cobrança e conta a pagar.
 *
 * Mora fora do `ingest.ts` porque o `seed.ts` precisa do MESMO casamento: sem ele, o dataset
 * fictício nasce sem `plannedId` nem `receivableId`, e um clone novo abre a tela de Pagamentos
 * dizendo que nove meses de aluguel estão vencidos — num conjunto que paga o aluguel todo mês.
 */
import type { MatchRule, PlannedEntry, Receivable, Transaction } from '../src/data/types.ts'
import { normalizeForRules } from './rules.ts'

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(d, lastDay))
  return date.toISOString().slice(0, 10)
}

/** Os meses em que a regra incide, limitados ao que os extratos cobrem. */
function windowOf(rule: { recurrence: string; startMonth: string; endMonth?: string; count?: number }, lastMonth: string): string[] {
  const planEnd = rule.recurrence === 'once' ? rule.startMonth : rule.recurrence === 'installments' ? addMonths(`${rule.startMonth}-01`, Math.max(1, rule.count ?? 1) - 1).slice(0, 7) : null
  const bounds = [rule.endMonth, planEnd, lastMonth].filter((m): m is string => Boolean(m))
  const until = bounds.reduce((a, b) => (a < b ? a : b))
  const months: string[] = []
  for (let month = rule.startMonth; month <= until; month = addMonths(`${month}-01`, 1).slice(0, 7)) months.push(month)
  return months
}

/**
 * O lançamento cumpre a regra? Uma implementação só para cobrança e conta a pagar — duas
 * divergiriam na primeira vez que alguém afinasse uma delas.
 *
 * A direção NÃO está aqui de propósito: quem chama sabe se espera entrada ou saída, e uma
 * regra que casasse os dois sinais transformaria o estorno de uma compra em pagamento dela.
 */
export function matchesRule(tx: Transaction, rule: MatchRule): boolean {
  if (rule.accountId && tx.accountId !== rule.accountId) return false
  const range = rule.amountBetween
  if (range) {
    const value = Math.abs(tx.amount)
    if ((range.min !== undefined && value < range.min) || (range.max !== undefined && value > range.max)) return false
  }
  // Merchant E descrição crua: uma regra de categoria pode ter REESCRITO o estabelecimento
  // ("Pix enviado para Fulana…" virou "Aluguel"), e aí o nome que a pessoa reconhece no banco
  // só sobrevive na descrição. Testar só o merchant fazia o aluguel casar zero de nove meses.
  const merchant = normalizeForRules(tx.merchant)
  const raw = normalizeForRules(tx.rawDescription)
  return rule.merchants.some((fragment) => merchant.includes(fragment) || raw.includes(fragment))
}

/** Os fragmentos de nome de uma regra estão normalizados? Um minúsculo nunca casaria nada. */
export function ruleProblems(where: string, rule: MatchRule): string[] {
  const problems: string[] = []
  if (rule.merchants.length === 0) problems.push(`${where}: sem nenhuma contraparte em match.merchants`)
  for (const fragment of rule.merchants) {
    if (fragment !== normalizeForRules(fragment)) problems.push(`${where}: match.merchants precisa estar normalizado — use "${normalizeForRules(fragment)}"`)
  }
  const range = rule.amountBetween
  if (range?.min !== undefined && range.max !== undefined && range.min > range.max) problems.push(`${where}: match.amountBetween com min maior que max`)
  return problems
}

/**
 * Marca as entradas que quitam uma cobrança.
 *
 * O critério é CONTRAPARTE + CONTA + mês dentro da janela — nunca o valor. O rateio varia mês
 * a mês, e no conjunto real dois recebimentos de exatamente R$ 750 vinham de origens
 * diferentes (o colega de apartamento e a manutenção de um cliente): casar por número teria
 * juntado os dois.
 *
 * Uma transação só é marcada uma vez. Se duas cobranças disputarem a mesma entrada, a
 * primeira declarada vence e a segunda vira aviso — sobreposição de janela é erro de config,
 * não algo a resolver em silêncio.
 */
export function matchReceivables(transactions: Transaction[], receivables: Receivable[]): { matches: ReceivableMatch[]; conflicts: string[] } {
  const conflicts: string[] = []
  const lastMonth =
    transactions
      .map((tx) => tx.date.slice(0, 7))
      .sort()
      .at(-1) ?? ''
  const matches: ReceivableMatch[] = []

  for (const receivable of receivables) {
    const months = windowOf(receivable, lastMonth)

    const matched = new Set<string>()
    const payers = new Set<string>()
    let received = 0
    for (const tx of transactions) {
      if (tx.amount <= 0) continue
      const month = tx.date.slice(0, 7)
      if (!months.includes(month)) continue
      if (!matchesRule(tx, receivable.match)) continue
      if (tx.receivableId) {
        conflicts.push(`${receivable.id}: a entrada de ${tx.date} já quita ${tx.receivableId} — janelas sobrepostas?`)
        continue
      }
      tx.receivableId = receivable.id
      matched.add(month)
      payers.add(tx.merchant)
      received += tx.amount
    }
    matches.push({ receivableId: receivable.id, months, matched: [...matched].sort(), received, payers })
  }
  return { matches, conflicts }
}

export interface PlannedMatch {
  plannedId: string
  months: string[]
  matched: string[]
  total: number
}

/**
 * Marca os lançamentos que cumprem uma regra prevista — a conta a pagar que de fato foi paga,
 * a receita declarada que de fato caiu.
 *
 * Só regras COM `match` entram: uma rubrica de gasto ("alimentação") não tem credor único e
 * perguntar se ela foi paga não faz sentido. É a mesma distinção que separa as duas naturezas
 * de declaração — ver `PlannedEntry.match`.
 *
 * O sinal vem do `kind`: uma regra de saída só casa lançamento negativo. Sem isso, o estorno
 * de uma compra contaria como pagamento dela.
 */
export function matchPlanned(transactions: Transaction[], planned: PlannedEntry[]): { matches: PlannedMatch[]; conflicts: string[] } {
  const conflicts: string[] = []
  const lastMonth =
    transactions
      .map((tx) => tx.date.slice(0, 7))
      .sort()
      .at(-1) ?? ''
  const matches: PlannedMatch[] = []

  for (const entry of planned) {
    if (!entry.match) continue
    const months = windowOf(entry, lastMonth)

    const matched = new Set<string>()
    let total = 0
    for (const tx of transactions) {
      if (entry.kind === 'income' ? tx.amount <= 0 : tx.amount >= 0) continue
      const month = tx.date.slice(0, 7)
      if (!months.includes(month)) continue
      if (!matchesRule(tx, entry.match)) continue
      if (tx.plannedId) {
        conflicts.push(`${entry.id}: o lançamento de ${tx.date} já cumpre ${tx.plannedId} — regras sobrepostas?`)
        continue
      }
      tx.plannedId = entry.id
      matched.add(month)
      total += Math.abs(tx.amount)
    }
    matches.push({ plannedId: entry.id, months, matched: [...matched].sort(), total })
  }
  return { matches, conflicts }
}
