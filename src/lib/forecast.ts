import type { ViewTransaction } from './finance'
import { shiftMonth } from './finance'
import { amountAt, occursIn, type PlannedEntry } from './planned'

/**
 * Previsão de um mês futuro.
 *
 * `committed` é a única parte que não é declaração: parcelas de cartão já compradas
 * cuja cobrança ainda vai cair. Elas entram sozinhas, porque são fato e o usuário não
 * deveria ter que redigitá-las. Todo o resto vem das regras cadastradas na tela de
 * Previsão — nada é extrapolado do histórico.
 */
export interface ForecastMonth {
  month: string
  income: number
  expense: number
  net: number
  committed: number
  /** Nada cadastrado nem contratado: o mês aparece vazio de propósito. */
  empty: boolean
}

type Installment = NonNullable<ViewTransaction['installment']>

/**
 * A compra por trás de uma parcela.
 *
 * Recuar `current - 1` meses leva toda parcela da mesma compra ao MESMO mês de origem, então
 * estabelecimento + total de parcelas + origem identifica a compra. Conferido nos dados: os
 * 31 grupos que isso produz não têm número de parcela repetido nem valor divergente — ou
 * seja, a chave não funde compras diferentes do mesmo estabelecimento.
 */
function purchaseKey(tx: ViewTransaction, installment: Installment): string {
  return `${tx.merchant}|${installment.total}|${shiftMonth(tx.month, -(installment.current - 1))}`
}

/**
 * Parcelas em aberto projetadas para a frente, com a categoria de origem preservada.
 *
 * Só a ÚLTIMA parcela vista de cada compra projeta. Uma compra parcelada aparece numa fatura
 * por mês, e cada aparição traz consigo as parcelas que ainda faltam: projetar a partir de
 * todas conta a mesma compra várias vezes. Medido no conjunto — 117 linhas de parcela para
 * 31 compras, e um "já contratado" de R$ 6.200,00 no lugar dos R$ 3.100,00 reais.
 */
function committedByCategory(history: ViewTransaction[], targets: string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  const wanted = new Set(targets)

  // A fatura mais recente de cada cartão. Uma compra só continua rodando se a última parcela
  // dela apareceu NESSA fatura: se parou de aparecer enquanto os extratos seguiram vindo, a
  // série acabou — estorno, quitação antecipada, cancelamento. Foi o caso de uma hospedagem em 6x de
  // maio, estornado em julho (duas entradas positivas de +890 na mesma data de compra) e
  // recobrado como outro 6x; sem esta checagem ele projetava R$ 890,00 em outubro.
  const lastInvoice = new Map<string, string>()
  for (const tx of history) {
    const month = tx.invoice?.month
    if (month && month > (lastInvoice.get(tx.accountId) ?? '')) lastInvoice.set(tx.accountId, month)
  }

  const latest = new Map<string, { tx: ViewTransaction; installment: Installment }>()
  for (const tx of history) {
    if (tx.flow !== 'expense' || !tx.installment) continue
    const entry = { tx, installment: tx.installment }
    const key = purchaseKey(tx, tx.installment)
    const seen = latest.get(key)
    if (!seen || tx.installment.current > seen.installment.current) latest.set(key, entry)
  }

  for (const { tx, installment } of latest.values()) {
    if (tx.invoice?.month !== lastInvoice.get(tx.accountId)) continue
    for (let k = 1; k <= installment.total - installment.current; k++) {
      const month = shiftMonth(tx.month, k)
      if (!wanted.has(month)) continue
      const byMonth = out.get(tx.displayCategoryId) ?? new Map<string, number>()
      byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(tx.amount))
      out.set(tx.displayCategoryId, byMonth)
    }
  }
  return out
}

/**
 * Parcelas já contratadas que ainda vão cair nos meses dados, por mês e por categoria.
 *
 * Existe para o ÚLTIMO mês com dados, que quase sempre está incompleto: em 05/09/2026 setembro
 * tinha 9 lançamentos e R$ 420,00, mas R$ 1.180,00 de parcelas já contratadas ainda vão cair
 * nele. Esse valor não aparecia em lugar nenhum — nem como medido, nem como previsto, porque a
 * previsão só começava DEPOIS do último mês com dados.
 *
 * Só parcelas entram aqui, nunca as regras cadastradas: num mês que já tem extrato, uma regra
 * de "todo mês entra tal valor" contaria de novo o que de fato aconteceu.
 */
export function committedFor(history: ViewTransaction[], months: string[]): { byMonth: Map<string, number>; byCategory: Map<string, Map<string, number>> } {
  const byCategory = committedByCategory(history, months)
  const byMonth = new Map<string, number>()
  for (const perMonth of byCategory.values()) {
    for (const [month, value] of perMonth) byMonth.set(month, (byMonth.get(month) ?? 0) + value)
  }
  return { byMonth, byCategory }
}

interface Input {
  /**
   * Histórico COMPLETO do recorte, não a fatia do período do cabeçalho. Parcela contratada
   * é fato: uma compra em 6x feita em março continua caindo em outubro, o usuário tendo ou
   * não escolhido ver março. Passar aqui o recorte já filtrado fazia o "já contratado"
   * encolher conforme o período estreitava, sem nenhum aviso na tela.
   */
  history: ViewTransaction[]
  /** Regras já filtradas pelo recorte PF/PJ vigente. */
  planned: PlannedEntry[]
  /** Meses a prever, em ordem. */
  targets: string[]
}

export function buildForecast({ history, planned, targets }: Input): ForecastMonth[] {
  if (!targets.length) return []

  const committed = new Map<string, number>()
  for (const byMonth of committedByCategory(history, targets).values()) {
    for (const [month, value] of byMonth) committed.set(month, (committed.get(month) ?? 0) + value)
  }

  return targets.map((month) => {
    let income = 0
    let planExpense = 0
    for (const entry of planned) {
      if (!occursIn(entry, month)) continue
      const value = amountAt(entry, month)
      if (entry.kind === 'income') income += value
      else planExpense += value
    }
    const c = committed.get(month) ?? 0
    const expense = planExpense + c
    return { month, income, expense, net: income - expense, committed: c, empty: income === 0 && expense === 0 }
  })
}

/**
 * Mesma previsão aberta por categoria, para o empilhado da página de Categorias.
 * Como agora tudo vem de valores declarados e de parcelas exatas, a soma por categoria
 * fecha com o total por construção — não há rateio nem normalização.
 *
 * Devolve `categoria → mês → valor previsto`.
 */
export function buildCategoryForecast({ history, planned, targets }: Input): Record<string, Record<string, number>> {
  if (!targets.length) return {}

  const out: Record<string, Record<string, number>> = {}
  const add = (category: string, month: string, value: number) => {
    if (value <= 0) return
    out[category] ??= {}
    out[category][month] = (out[category][month] ?? 0) + value
  }

  for (const [category, byMonth] of committedByCategory(history, targets)) {
    for (const [month, value] of byMonth) add(category, month, value)
  }
  for (const entry of planned) {
    if (entry.kind !== 'expense') continue
    for (const month of targets) {
      if (!occursIn(entry, month)) continue
      add(entry.categoryId, month, amountAt(entry, month))
    }
  }
  return out
}
