import { ArrowUUpLeft, CalendarDot, CreditCard, ShoppingBag, Target } from '@phosphor-icons/react'
import type { EnumOption, Plan } from '@wlet/domain'
import type { ViewTransaction } from './finance'
import { shiftMonth, toCents } from './finance'
import { BUDGET } from './budget'
import { rubricAmount } from '@wlet/domain/rubric'
import { amountAt, dueDateOf, occursIn, pendingIn, settlePlanned, type PlannedEntry } from './planned'
import { installmentAmount, planInstallments, planMonths, planOccursIn } from '@wlet/domain/plans'
import { dueDateOf as receivableDueDateOf, occursIn as receivableOccursIn, settle, type Receivable } from './receivables'

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
  /**
   * A saída aberta por ORIGEM. Existe porque a previsão de um mês vem de quatro lugares, e
   * sem discriminá-los o total vira um número que ninguém consegue conferir — foi assim que a
   * tela de Previsão passou a mostrar moradia cheia enquanto o gráfico mostrava a líquida.
   */
  sources: ForecastSources
  /** Nada cadastrado nem contratado: o mês aparece vazio de propósito. */
  empty: boolean
}

export interface ForecastSources {
  /** Regras de `planned.config.ts`: o que você declarou que vai pagar. */
  declared: number
  /** Parcelas de cartão já compradas. Não é declaração, é fato. */
  committed: number
  /**
   * Planos de compra (`wlet.plans`), tratados como o declarado: entram ANTES do piso da
   * rubrica, então uma viagem planejada de R$ 800 numa categoria com rubrica de R$ 500 projeta
   * 800, não 1.300. Origem própria porque é a única parcela da previsão que não vem de
   * arquivo — sem separá-la, o total deixaria de ser conferível.
   */
  plan: number
  /** Rubricas de `budget.config.ts`, já como PISO — só o que elas acrescentam ao acima. */
  rubric: number
  /** O que as cobranças abatem, negativo. */
  offset: number
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
export interface CommittedInstallment {
  month: string
  merchant: string
  /** Identidade da COMPRA de origem. Duas compras do mesmo estabelecimento se distinguem. */
  purchase: string
  /** Valor absoluto da parcela. */
  amount: number
  categoryId: string
  installment: Installment
}

/**
 * As parcelas em aberto, UMA A UMA.
 *
 * `committedByCategory` é derivada daqui e não o contrário: a regra difícil — só a última
 * parcela vista projeta, e só se ela apareceu na fatura mais recente daquele cartão — passou
 * a viver num lugar só. Duas implementações dela divergiriam, e o defeito seria silencioso.
 */
function committedInstallments(history: ViewTransaction[], targets: string[]): CommittedInstallment[] {
  const out: CommittedInstallment[] = []
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
      out.push({
        month,
        merchant: tx.merchant,
        purchase: purchaseKey(tx, installment),
        amount: Math.abs(tx.amount),
        categoryId: tx.displayCategoryId,
        installment: { current: installment.current + k, total: installment.total },
      })
    }
  }
  return out
}

function committedByCategory(history: ViewTransaction[], targets: string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const item of committedInstallments(history, targets)) {
    const byMonth = out.get(item.categoryId) ?? new Map<string, number>()
    byMonth.set(item.month, (byMonth.get(item.month) ?? 0) + item.amount)
    out.set(item.categoryId, byMonth)
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

/**
 * O que as regras cadastradas ainda vão trazer para o mês EM CURSO — só as ocorrências cuja
 * data cai depois de `after`, a última data com dado.
 *
 * A regra antiga era não misturar regra nenhuma num mês que já tem extrato, porque um "todo
 * mês entra tal valor" recontaria o que já aconteceu. O que destravou isso foi o dia: com
 * ele, a ocorrência de 25/09 é claramente futura num extrato que vai até 02/09, e a de 05/09
 * é claramente passada. Regra sem dia declarado continua de fora — ver `pendingIn`.
 */
export interface Pending {
  income: number
  expense: number
  byCategory: Map<string, number>
}

export function pendingFor(input: Omit<Input, 'targets'>, month: string, after: string): Pending {
  let income = 0
  let expense = 0
  const byCategory = new Map<string, number>()
  for (const item of forecastItems(input, month, after)) {
    // Parcela contratada entra pelo `committedFor`, que quem chama já soma à parte. Ela está
    // na agenda porque é fato do mês; contá-la aqui de novo dobraria a saída.
    if (item.origin === 'committed') continue
    if (item.amount > 0 && item.origin === 'declared') {
      income += item.amount
      continue
    }
    // Abatimento é crédito na despesa, não entrada — a mesma leitura de `flowOf`.
    expense -= item.amount
    byCategory.set(item.categoryId, Math.max(0, (byCategory.get(item.categoryId) ?? 0) - item.amount))
  }
  return { income, expense, byCategory }
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
  /** Cobranças já filtradas pelo recorte. O que elas abatem também é previsão. */
  receivables: Receivable[]
  /**
   * Planos de compra a considerar, JÁ filtrados por quem chama — decididos sempre, em estudo
   * só quando a tela está simulando. A decisão de o que entra é de quem chama de propósito:
   * assim a mesma função serve à previsão real e à simulação, e não existe um segundo cálculo.
   */
  plans?: Plan[]
  /** Meses a prever, em ordem. */
  targets: string[]
}

/**
 * A saída prevista de um mês, aberta por categoria.
 *
 * Três camadas, e a ordem entre elas é a regra:
 *
 * 1. o que já é FATO — parcela de cartão contratada — mais o que está DECLARADO em
 *    `planned.config.ts` com credor conhecido;
 * 2. a rubrica de `budget.config.ts` como PISO, não soma: uma categoria com R$ 300 já
 *    contratados e rubrica de R$ 1.000 projeta 1.000, não 1.300. Somar contaria o mesmo gasto
 *    duas vezes — a parcela do Airbnb já é viagem, e a rubrica de viagem não a acrescenta;
 * 3. o abatimento das cobranças, que é crédito e entra por último, sobre o valor já formado.
 *    Sem ele o aluguel projetaria R$ 1.500 cheios enquanto metade volta todo mês.
 */
function expenseByCategory(input: Input, month: string, committedByCat: Map<string, Map<string, number>>): { byCategory: Map<string, number>; sources: ForecastSources } {
  const out = new Map<string, number>()
  const sources: ForecastSources = { declared: 0, committed: 0, plan: 0, rubric: 0, offset: 0 }
  const add = (categoryId: string, value: number) => {
    if (value === 0) return
    out.set(categoryId, (out.get(categoryId) ?? 0) + value)
  }

  for (const [categoryId, byMonth] of committedByCat) {
    const value = byMonth.get(month) ?? 0
    add(categoryId, value)
    sources.committed += value
  }
  for (const entry of input.planned) {
    if (entry.kind !== 'expense' || !occursIn(entry, month)) continue
    const value = amountAt(entry, month)
    add(entry.categoryId, value)
    sources.declared += value
  }

  // ANTES da rubrica, e é essa posição que faz a regra do piso valer para o plano também:
  // com o plano já somado na categoria, a rubrica só acrescenta o que faltar para o piso.
  for (const plan of input.plans ?? []) {
    if (!planOccursIn(plan, month)) continue
    const value = installmentAmount(plan)
    add(plan.categoryId, value)
    sources.plan += value
  }

  for (const rubrica of BUDGET.byCategory ?? []) {
    const planejado = rubricAmount(rubrica)
    const already = out.get(rubrica.categoryId) ?? 0
    if (planejado <= already) continue
    // Só o que ela ACRESCENTA entra na origem: a rubrica é piso, então a parte já coberta por
    // parcela ou por conta declarada pertence àquelas origens, não a esta.
    sources.rubric += planejado - already
    out.set(rubrica.categoryId, planejado)
  }

  for (const receivable of input.receivables) {
    if (!receivableOccursIn(receivable, month)) continue
    const already = out.get(receivable.offsetsCategoryId) ?? 0
    const applied = Math.min(already, receivable.amount)
    sources.offset -= applied
    out.set(receivable.offsetsCategoryId, already - applied)
  }
  return { byCategory: out, sources }
}

export function buildForecast(input: Input): ForecastMonth[] {
  const { history, planned, targets } = input
  if (!targets.length) return []

  const byCategory = committedByCategory(history, targets)
  const committed = new Map<string, number>()
  for (const perMonth of byCategory.values()) {
    for (const [month, value] of perMonth) committed.set(month, (committed.get(month) ?? 0) + value)
  }

  return targets.map((month) => {
    let income = 0
    for (const entry of planned) {
      if (entry.kind !== 'income' || !occursIn(entry, month)) continue
      income += amountAt(entry, month)
    }
    // A saída sai da abertura por categoria, e não de uma soma paralela: é ela que aplica o
    // piso da rubrica e o abatimento das cobranças. Duas contas divergiriam.
    const { byCategory: perCategory, sources } = expenseByCategory(input, month, byCategory)
    let expense = 0
    for (const value of perCategory.values()) expense += value
    const c = committed.get(month) ?? 0
    return { month, income, expense: toCents(expense), net: toCents(income - expense), committed: c, sources, empty: income === 0 && expense === 0 }
  })
}

/**
 * Mesma previsão aberta por categoria, para o empilhado da página de Categorias.
 * Como agora tudo vem de valores declarados e de parcelas exatas, a soma por categoria
 * fecha com o total por construção — não há rateio nem normalização.
 *
 * Devolve `categoria → mês → valor previsto`.
 */
export function buildCategoryForecast(input: Input): Record<string, Record<string, number>> {
  const { history, targets } = input
  if (!targets.length) return {}

  const committed = committedByCategory(history, targets)
  const out: Record<string, Record<string, number>> = {}
  for (const month of targets) {
    for (const [category, value] of expenseByCategory(input, month, committed).byCategory) {
      if (value <= 0) continue
      out[category] ??= {}
      out[category][month] = value
    }
  }
  return out
}

/**
 * De onde vem um item previsto. Não é enum de domínio — nada disto é serializado —, então a
 * lista mora aqui, ao lado de quem a produz, e não em `data/types.ts`.
 */
export type ForecastOrigin = 'declared' | 'committed' | 'plan' | 'rubric' | 'offset'

export const forecastOrigins: EnumOption<ForecastOrigin>[] = [
  { value: 'committed', label: 'Contratado', icon: CreditCard, tone: 'neutral' },
  { value: 'declared', label: 'Declarado', icon: CalendarDot, tone: 'neutral' },
  { value: 'plan', label: 'Plano', icon: ShoppingBag, tone: 'neutral' },
  { value: 'rubric', label: 'Rubrica', icon: Target, tone: 'muted' },
  { value: 'offset', label: 'Abatido', icon: ArrowUUpLeft, tone: 'positive' },
]

export interface ForecastItem {
  key: string
  /** Dia em que cai, quando se sabe. Parcela e rubrica não têm — ver `ForecastAgenda`. */
  date: string | null
  label: string
  categoryId: string
  /** Com sinal: positivo entra, negativo sai. */
  amount: number
  origin: ForecastOrigin
  installment?: Installment
}

/**
 * O que vai acontecer num mês, item a item.
 *
 * Segue EXATAMENTE a ordem de `expenseByCategory` — fato e declarado, depois o piso da
 * rubrica, depois o abatimento — porque a soma daqui tem que fechar com o total que o
 * gráfico desenha. Se as duas divergirem, a gaveta contradiz a linha que a abriu.
 *
 * `pendingAfter` liga a leitura do mês EM CURSO: só o que ainda vence, e sem rubrica — uma
 * rubrica no mês corrente não é algo a acontecer, é um teto sendo consumido.
 */
export function forecastItems(input: Omit<Input, 'targets'>, month: string, pendingAfter?: string): ForecastItem[] {
  const partial = pendingAfter !== undefined
  const items: ForecastItem[] = []
  const gross = new Map<string, number>()
  const bump = (categoryId: string, value: number) => gross.set(categoryId, (gross.get(categoryId) ?? 0) + value)

  // Quanto de cada regra JÁ foi cumprido na ocorrência deste mês. Vem da CONCILIAÇÃO, não de
  // uma soma dos lançamentos do mês: numa cobrança parcelada o dinheiro pode ter entrado em
  // agosto e quitar setembro, e somar por mês diria que setembro está em aberto — foi o que a
  // agenda mostrou, cobrando de novo um rateio que o pagador já tinha adiantado.
  const done = new Map<string, number>()
  if (partial) {
    for (const occurrence of settle(input.history, [month], pendingAfter)) {
      if (occurrence.month === month) done.set(occurrence.ruleId, occurrence.actual)
    }
    for (const occurrence of settlePlanned(input.history, [month], pendingAfter)) {
      if (occurrence.month === month) done.set(occurrence.ruleId, occurrence.actual)
    }
  }

  for (const item of committedInstallments(input.history, [month])) {
    bump(item.categoryId, item.amount)
    items.push({
      // Pela COMPRA e não pelo estabelecimento: duas compras do mesmo lugar podem cair no
      // mesmo mês com o mesmo número de parcela, e a chave repetida quebraria a lista.
      key: `committed-${item.purchase}-${item.installment.current}`,
      date: null,
      label: item.merchant,
      categoryId: item.categoryId,
      amount: -item.amount,
      origin: 'committed',
      installment: item.installment,
    })
  }

  for (const entry of input.planned) {
    if (partial ? !pendingIn(entry, month, pendingAfter) : !occursIn(entry, month)) continue
    const value = partial ? Math.max(0, amountAt(entry, month) - (done.get(entry.id) ?? 0)) : amountAt(entry, month)
    if (value === 0) continue
    if (entry.kind === 'expense') bump(entry.categoryId, value)
    items.push({
      key: `declared-${entry.id}`,
      date: dueDateOf(entry, month),
      label: entry.label,
      categoryId: entry.categoryId,
      amount: entry.kind === 'income' ? value : -value,
      origin: 'declared',
    })
  }

  // Plano entra também no mês EM CURSO, ao contrário da rubrica: uma rubrica ali é teto sendo
  // consumido, um plano é uma compra que ainda vai acontecer.
  for (const plan of input.plans ?? []) {
    if (!planOccursIn(plan, month)) continue
    const value = installmentAmount(plan)
    bump(plan.categoryId, value)
    const total = planInstallments(plan)
    const current = planMonths(plan).indexOf(month) + 1
    items.push({
      key: `plan-${plan.id}-${month}`,
      date: null,
      label: plan.label,
      categoryId: plan.categoryId,
      amount: -value,
      origin: 'plan',
      installment: total > 1 ? { current, total } : undefined,
    })
  }

  if (!partial) {
    for (const rubrica of BUDGET.byCategory ?? []) {
      const planejado = rubricAmount(rubrica)
      const already = gross.get(rubrica.categoryId) ?? 0
      if (planejado <= already) continue
      const extra = planejado - already
      gross.set(rubrica.categoryId, planejado)
      items.push({ key: `rubric-${rubrica.categoryId}`, date: null, label: 'Gasto planejado', categoryId: rubrica.categoryId, amount: -extra, origin: 'rubric' })
    }
  }

  for (const receivable of input.receivables) {
    if (!receivableOccursIn(receivable, month)) continue
    const due = receivableDueDateOf(receivable, month)
    if (partial && (!due || due <= pendingAfter)) continue
    const expected = partial ? Math.max(0, receivable.amount - (done.get(receivable.id) ?? 0)) : receivable.amount
    const already = gross.get(receivable.offsetsCategoryId) ?? 0
    const applied = Math.min(already, expected)
    if (applied <= 0) continue
    gross.set(receivable.offsetsCategoryId, already - applied)
    items.push({ key: `offset-${receivable.id}`, date: due, label: `Rateio · ${receivable.debtor}`, categoryId: receivable.offsetsCategoryId, amount: applied, origin: 'offset' })
  }

  // Ordem: por dia, e o que não tem dia vai para o fim. Parcela cai na fatura, cuja data
  // depende do fechamento; rubrica não tem dia nenhum. Fingir uma data ali seria inventar
  // precisão que o dado não tem.
  return items.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || Math.abs(b.amount) - Math.abs(a.amount)
    if (a.date) return -1
    if (b.date) return 1
    return Math.abs(b.amount) - Math.abs(a.amount)
  })
}
