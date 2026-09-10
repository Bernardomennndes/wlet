import type { BudgetCadence, BudgetCategory, BudgetItem, Flow } from '@wlet/domain'

/**
 * Quanto uma rubrica vale — a ÚNICA resposta a essa pergunta no app inteiro.
 *
 * Uma rubrica pode ser um número digitado ou uma composição de itens (`quantity` ×
 * `unitAmount`). Quem tem itens é medido por eles; quem não tem, pelo `amount`. Nunca pelos
 * dois: guardar um total ao lado da composição que o gera é criar duas somas para a mesma
 * grandeza, e elas divergem no primeiro item editado — foi exatamente assim que a tela de
 * Previsão já produziu um terceiro número para um mês que só devia ter um.
 *
 * O módulo é PURO e separado de `src/lib/budget.ts` por uma razão dura: aquele lê
 * `declarations()` na avaliação, então importá-lo acorda o portão de boot. O serviço de
 * configuração precisa desta conta para validar e normalizar o que grava, e não pode tocar o
 * portão — `scripts/checks/services-boot.test.ts` falharia, e no navegador o sintoma seria
 * uma página em branco.
 */
/**
 * Quantas vezes uma cadência cabe num mês MÉDIO.
 *
 * As três saem do mesmo ano civil de 365 dias, e essa âncora única é o ponto: com a semana
 * vindo de "52 por ano" e o dia de "365 por ano", as duas descreveriam anos diferentes — 364
 * dias contra 365 —, e dois itens idênticos declarados em cadências diferentes fechariam o ano
 * com valores distintos sem nada explicar.
 *
 * A média anual é preferida às semanas REAIS de cada mês porque a rubrica é uma declaração,
 * não uma medição: com o calendário mandando, o mesmo item passaria a valer 4 semanas em
 * fevereiro e 5 em março, e a projeção dos meses futuros oscilaria sem ninguém ter mexido nela.
 * O preço é que nenhum mês isolado bate exatamente; o ano, sim.
 */
export const MONTHLY_OCCURRENCES: Record<BudgetCadence, number> = {
  day: 365 / 12, // 30,417
  week: 365 / 7 / 12, // 4,345
  month: 1,
}

/** Quanto o item custa por MÊS — a base em que a rubrica, o teto e a projeção falam. */
export function itemAmount(item: BudgetItem): number {
  return item.quantity * item.unitAmount * MONTHLY_OCCURRENCES[item.cadence ?? 'month']
}

/** O custo do item na CADÊNCIA declarada, sem converter: é o número que a pessoa digitou. */
export function itemAmountPerCadence(item: BudgetItem): number {
  return item.quantity * item.unitAmount
}

export function rubricAmount(rubric: BudgetCategory): number {
  if (!rubric.items?.length) return rubric.amount
  return rubric.items.reduce((total, item) => total + itemAmount(item), 0)
}

/** Se o valor é composto — o que decide se a tela mostra a lista ou o campo único. */
export function hasComposition(rubric: BudgetCategory): boolean {
  return Boolean(rubric.items?.length)
}

/**
 * O mínimo que a conta do gasto precisa saber de uma transação.
 *
 * Declarado por FORMA em vez de importar `ViewTransaction`: aquele tipo mora em
 * `src/lib/finance.ts`, que lê `declarations()` na avaliação, e este módulo é justamente o
 * que precisa continuar puro para o serviço de configuração usá-lo. `ViewTransaction`
 * satisfaz esta forma, então a tela passa a lista dela direto.
 */
export interface RubricSpending {
  date: string
  displayCategoryId: string
  flow: Flow
  amount: number
}

/** Uma janela de medição, em AAAA-MM-DD, com as duas pontas INCLUSIVAS. */
export interface DateRange {
  from: string
  to: string
}

/**
 * A data em UTC. O projeto evita `new Date('2026-09-10')` interpretado no fuso local porque
 * ele recua um dia a oeste de Greenwich — a mesma armadilha que `shiftMonth` evita fazendo
 * aritmética de mês na mão.
 */
function utc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** O mês inteiro, do dia 1 ao último — que o próprio calendário informa. */
export function monthRange(month: string): DateRange {
  const [year, index] = month.split('-').map(Number)
  return { from: `${month}-01`, to: iso(new Date(Date.UTC(year, index, 0))) }
}

/**
 * A semana que contém a data, de SEGUNDA a domingo.
 *
 * Segunda porque é a semana ISO e é como se fala de "esta semana" em português — uma semana
 * que vira no domingo cortaria o fim de semana em duas, e é justamente nele que a compra de
 * mercado costuma cair.
 */
export function weekRange(date: string): DateRange {
  const reference = utc(date)
  const backToMonday = (reference.getUTCDay() + 6) % 7
  const from = new Date(reference)
  from.setUTCDate(reference.getUTCDate() - backToMonday)
  const to = new Date(from)
  to.setUTCDate(from.getUTCDate() + 6)
  return { from: iso(from), to: iso(to) }
}

/**
 * Quanto saiu de uma categoria numa JANELA, LÍQUIDO de reembolso.
 *
 * A janela é de datas e não de mês porque a tela alterna entre semana e mês, e uma semana
 * atravessa a virada do mês — medir por `tx.month` a partiria em duas.
 *
 * O reembolso entra com sinal invertido porque ele é despesa negativa — pagar o aluguel
 * inteiro e receber metade de volta deixa a moradia pelo custo real, e a rubrica tem de medir
 * o mesmo número que o resto do app. Trava em zero pela razão de `summarizeByCategory`: um
 * rateio que chega numa janela sem a despesa correspondente deixaria a categoria negativa, e
 * "gastei menos zero" não é leitura que uma barra saiba desenhar.
 */
export function rubricSpent(history: readonly RubricSpending[], range: DateRange, categoryId: string): number {
  let total = 0
  for (const tx of history) {
    if (tx.date < range.from || tx.date > range.to) continue
    if (tx.displayCategoryId !== categoryId) continue
    if (tx.flow === 'expense') total += Math.abs(tx.amount)
    else if (tx.flow === 'reimbursement') total -= Math.abs(tx.amount)
  }
  return Math.max(0, total)
}
