import accountsJson from '@/generated/accounts.json'
import metaJson from '@/generated/meta.json'
import transactionsJson from '@/generated/transactions.json'
import transfersJson from '@/generated/transfers.json'
import { CATEGORY_MAP } from '@/data/categories'
import { offsetCategoryOf } from './receivables'
import type { Account, DatasetMeta, Flow, Transaction, Transfer } from '@/data/types'

// `Flow` e `flowKinds` moram em `@/data/types` com os outros pares de enum; reexportados
// aqui porque este é o módulo que decide o fluxo de uma transação e quase todo consumidor
// chega por ele.
export type { Flow }
export { flowKinds } from '@/data/types'

export const ACCOUNTS = accountsJson as Account[]
export const TRANSACTIONS = transactionsJson as Transaction[]
export const TRANSFERS = transfersJson as Transfer[]
export const META = metaJson as DatasetMeta

export const ACCOUNT_MAP: Record<string, Account> = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]))

export type Scope = 'all' | 'PF' | 'PJ'

export interface Period {
  from: string // AAAA-MM
  to: string // AAAA-MM
}

export function accountInScope(accountId: string, scope: Scope): boolean {
  if (scope === 'all') return true
  const account = ACCOUNT_MAP[accountId]
  return account ? account.entity === scope : false
}

/**
 * Como uma transação conta dentro de um recorte (consolidado, PF ou PJ).
 * Uma transferência só é neutra quando as duas pontas estão no recorte;
 * caso contrário ela vira entrada ou saída "real" daquele recorte
 * (ex.: retirada da PJ para a PF é despesa na visão PJ e renda na visão PF).
 */
export function flowOf(tx: Transaction, scope: Scope): Flow {
  // Antes de tudo: dinheiro que entra e não é seu. É o rateio de uma despesa que você
  // adiantou, então não é receita (somá-la infla os dois lados) nem transferência (veio de
  // outra pessoa) — ele abate a despesa de origem. Ver `summarizeByMonth`.
  if (tx.receivableId && tx.amount > 0) return 'reimbursement'
  if (tx.transferKind) {
    if (tx.transferKind === 'unmatched-self') return 'transfer'
    if (!tx.counterpartAccountId) return 'transfer'
    if (accountInScope(tx.counterpartAccountId, scope)) return 'transfer'
    return tx.amount > 0 ? 'income' : 'expense'
  }
  return tx.amount > 0 ? 'income' : 'expense'
}

/** Categoria exibida considerando o recorte (retiradas PJ↔PF ganham nome próprio). */
export function displayCategoryId(tx: Transaction, scope: Scope, override?: string): string {
  const base = override ?? tx.categoryId
  const flow = flowOf(tx, scope)
  // O crédito precisa cair na MESMA categoria que ele abate, senão ele não anula nada: uma
  // entrada em "Pix de pessoas" não reduz "Moradia" no empilhado nem na BarList.
  if (flow === 'reimbursement') return override ?? offsetCategoryOf(tx.receivableId) ?? base
  if (flow === 'transfer') return base
  if (tx.transferKind && tx.counterpartAccountId) {
    const own = ACCOUNT_MAP[tx.accountId]?.entity
    const other = ACCOUNT_MAP[tx.counterpartAccountId]?.entity
    if (own === 'PF' && other === 'PJ') return 'retirada-pj'
    if (own === 'PJ' && other === 'PF') return 'retirada-pf'
  }
  return base
}

export function monthOf(tx: Transaction): string {
  return tx.date.slice(0, 7)
}

export function inPeriod(tx: Transaction, period: Period): boolean {
  const m = monthOf(tx)
  return m >= period.from && m <= period.to
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** Último mês que tem lançamentos no conjunto, independente do período selecionado. */
export function lastMonthWithData(): string {
  return META.months[META.months.length - 1]
}

/**
 * A última data coberta por algum extrato ou fatura, em AAAA-MM-DD.
 *
 * Não é "hoje": o que separa o que já aconteceu do que ainda vai acontecer, para este app,
 * é até onde os arquivos vão. Um recebimento de ontem que ainda não foi exportado continua
 * sendo previsão — e contá-lo como previsão é o certo, porque ele não está nos dados.
 */
export function lastDateWithData(): string {
  let last = ''
  for (const account of ACCOUNTS) {
    const to = account.coverage?.to
    if (to && to > last) last = to
  }
  return last || `${lastMonthWithData()}-01`
}

/**
 * Fim do horizonte de projeção: dezembro do ano do último mês com dados.
 * Hoje isso dá 2026-12; vira 2027-12 sozinho quando entrar o primeiro extrato de 2027.
 */
export function projectionHorizon(): string {
  return `${lastMonthWithData().slice(0, 4)}-12`
}

/** Formato AAAA-MM. O seletor de período aceita qualquer mês, então validar o formato é o que resta. */
export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** "2026-09" + 3 → "2026-12". Aritmética de mês sem passar por Date, para não pegar fuso. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export interface ViewTransaction extends Transaction {
  flow: Flow
  displayCategoryId: string
  month: string
}

export interface Overrides {
  [transactionId: string]: string
}

/** Transações do recorte e período, já com fluxo e categoria resolvidos. */
export function selectTransactions(scope: Scope, period: Period, overrides: Overrides): ViewTransaction[] {
  const out: ViewTransaction[] = []
  for (const tx of TRANSACTIONS) {
    if (!accountInScope(tx.accountId, scope)) continue
    if (!inPeriod(tx, period)) continue
    out.push({
      ...tx,
      flow: flowOf(tx, scope),
      displayCategoryId: displayCategoryId(tx, scope, overrides[tx.id]),
      month: monthOf(tx),
    })
  }
  return out
}

export interface MonthSummary {
  month: string
  income: number
  expense: number
  net: number
  transfersOut: number
  count: number
}

/**
 * Arredonda para centavos e mata o zero negativo.
 *
 * Somar dezenas de valores em ponto flutuante NÃO devolve o número que a tela mostra: em
 * fevereiro/2026 as entradas da PJ somavam 12973.399999999999636 e as saídas
 * 12973.400000000001455 — idênticas nos centavos, e a razão entre elas dava 1.0000000000000002,
 * o bastante para um `> 1` pintar o mês de vermelho. Quem compara ou divide estes totais
 * precisa deles no MESMO grão em que são exibidos.
 *
 * O `|| 0` não é redundante: com resíduo negativo o arredondamento devolve -0, que o Intl
 * formata como "-R$ 0,00" e que `< 0` julga falso — negativo no texto e verde na cor.
 */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100 || 0
}

export function summarizeByMonth(txs: ViewTransaction[], months: string[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>(months.map((m) => [m, { month: m, income: 0, expense: 0, net: 0, transfersOut: 0, count: 0 }]))
  for (const tx of txs) {
    const row = map.get(tx.month)
    if (!row) continue
    row.count += 1
    if (tx.flow === 'income') row.income += tx.amount
    else if (tx.flow === 'expense') row.expense += -tx.amount
    // Reembolso é despesa negativa: a parte que voltou nunca foi custo seu. Não entra em
    // `income` — se entrasse, entrada e saída ficariam infladas na mesma medida e o resultado
    // do mês estaria certo por acaso, com os dois números errados.
    else if (tx.flow === 'reimbursement') row.expense -= tx.amount
    else if (tx.amount < 0) row.transfersOut += -tx.amount
  }
  for (const row of map.values()) {
    row.income = toCents(row.income)
    row.expense = toCents(row.expense)
    row.transfersOut = toCents(row.transfersOut)
    row.net = toCents(row.income - row.expense)
  }
  return [...map.values()]
}

export interface CategoryTotal {
  categoryId: string
  label: string
  total: number
  count: number
  share: number
  byMonth: Record<string, number>
}

/**
 * Totais por categoria.
 *
 * No eixo de despesa, o reembolso entra como CRÉDITO na categoria que ele abate — é a mesma
 * conta de `summarizeByMonth`, aberta por categoria, e sem ela a moradia apareceria pelo
 * valor cheio enquanto o total do mês já viria líquido.
 *
 * O crédito não conta como lançamento: "113 despesas em 8 meses" contaria uma entrada.
 *
 * O valor é travado em zero na saída. Se um reembolso chegar num mês sem a despesa
 * correspondente — o rateio de agosto pago em setembro —, a categoria ficaria negativa, e
 * nem pilha nem barra desenham fatia negativa. O total do MÊS continua exato, então nesse
 * caso raro a soma das fatias fica acima dele e a diferença aparece como "Outras saídas"
 * menor. Preferível a uma fatia impossível de desenhar.
 */
export function summarizeByCategory(txs: ViewTransaction[], flow: 'income' | 'expense'): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>()
  for (const tx of txs) {
    const isOffset = flow === 'expense' && tx.flow === 'reimbursement'
    if (tx.flow !== flow && !isOffset) continue
    const value = isOffset ? -Math.abs(tx.amount) : Math.abs(tx.amount)
    const row = map.get(tx.displayCategoryId) ?? {
      categoryId: tx.displayCategoryId,
      label: CATEGORY_MAP[tx.displayCategoryId]?.label ?? tx.displayCategoryId,
      total: 0,
      count: 0,
      share: 0,
      byMonth: {},
    }
    row.total += value
    if (!isOffset) row.count += 1
    row.byMonth[tx.month] = (row.byMonth[tx.month] ?? 0) + value
    map.set(tx.displayCategoryId, row)
  }
  const rows: CategoryTotal[] = []
  let grand = 0
  for (const row of map.values()) {
    row.total = Math.max(0, toCents(row.total))
    for (const month of Object.keys(row.byMonth)) row.byMonth[month] = Math.max(0, toCents(row.byMonth[month]))
    if (row.total <= 0) continue
    grand += row.total
    rows.push(row)
  }
  rows.sort((a, b) => b.total - a.total)
  for (const row of rows) row.share = grand > 0 ? row.total / grand : 0
  return rows
}

export interface MerchantTotal {
  merchant: string
  categoryId: string
  total: number
  count: number
  months: string[]
  byMonth: Record<string, number>
  avgTicket: number
  lastDate: string
}

export function summarizeByMerchant(txs: ViewTransaction[], flow: 'income' | 'expense' = 'expense'): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>()
  for (const tx of txs) {
    if (tx.flow !== flow) continue
    const key = tx.merchant
    const value = Math.abs(tx.amount)
    const row = map.get(key) ?? { merchant: key, categoryId: tx.displayCategoryId, total: 0, count: 0, months: [], byMonth: {}, avgTicket: 0, lastDate: tx.date }
    row.total += value
    row.count += 1
    row.byMonth[tx.month] = (row.byMonth[tx.month] ?? 0) + value
    if (tx.date > row.lastDate) row.lastDate = tx.date
    map.set(key, row)
  }
  const rows = [...map.values()]
  for (const row of rows) {
    row.months = Object.keys(row.byMonth).sort()
    row.avgTicket = row.total / row.count
  }
  return rows.sort((a, b) => b.total - a.total)
}

export interface Recurring extends MerchantTotal {
  monthlyAverage: number
  /** Quão estável é o valor mensal (0 = idêntico todo mês). */
  variability: number
}

/** Cobranças que se repetem em vários meses: assinaturas, serviços, contas fixas. */
export function detectRecurring(merchants: MerchantTotal[], monthsInPeriod: number, minMonths = 3): Recurring[] {
  const out: Recurring[] = []
  for (const m of merchants) {
    if (m.months.length < Math.min(minMonths, monthsInPeriod)) continue
    const values = m.months.map((k) => m.byMonth[k])
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length
    const variability = avg > 0 ? Math.sqrt(variance) / avg : 0
    out.push({ ...m, monthlyAverage: avg, variability })
  }
  return out.sort((a, b) => b.monthlyAverage - a.monthlyAverage)
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function lastCompleteMonth(months: string[]): string | null {
  const today = new Date().toISOString().slice(0, 7)
  const complete = months.filter((m) => m < today)
  return complete.length ? complete[complete.length - 1] : null
}
