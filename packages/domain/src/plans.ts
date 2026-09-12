import { CATEGORY_MAP } from '@wlet/domain'
import type { PaymentMode, Plan, PlanGroup, PlanStatus } from '@wlet/domain'

/**
 * Os planos: o catálogo de intenções de compra, guardado no navegador.
 *
 * **Este é o único dado do app que NÃO vem de arquivo**, e a escolha tem uma consequência que
 * precisa ficar dita: a previsão passa a depender do navegador. Um clone novo não reproduz o
 * número, o relatório do `pnpm ingest` não o enxerga, e dois navegadores seus divergem. Em
 * troca, a lista se edita na tela — que é o que uma lista de desejos precisa, porque ela muda
 * o tempo todo e não é verdade contábil.
 *
 * A mitigação é exportar e importar JSON, o mesmo caminho que os ajustes de categoria já têm.
 */

/**
 * O nome da chave, sem prefixo — quem monta a chave completa é `@/lib/storage`.
 *
 * O prefixo mora lá porque ele é do APP e não deste módulo, e porque a leitura de lá migra
 * sozinha o que estiver gravado sob o prefixo antigo: um navegador que já usou a versão
 * "wallet" continua abrindo com os planos dele.
 */
/**
 * Em quantas vezes um parcelamento pode ser dividido: de 2 a 99.
 *
 * Mora no DOMÍNIO porque é regra do domínio, e porque ela estava escrita em TRÊS lugares — a
 * gaveta, a edição em linha e este validador. Três verdades para a mesma regra divergem no
 * primeiro ajuste: mudar o teto num deles deixaria a tabela aceitando o que a gaveta recusa,
 * sem nada quebrar.
 *
 * Uma só vez NÃO é parcelamento: `1×` é à vista, e o app tem uma forma própria para dizer isso.
 */
export const isInstallmentCount = (n: number) => Number.isInteger(n) && n > 1 && n <= 99

export const PLANS_KEY = 'plans'

/**
 * O envelope é VERSIONADO desde o primeiro dia.
 *
 * Dado guardado como JSON opaco não tem migração se nascer sem versão: quando a forma mudar, o
 * que está gravado vira lixo silencioso — e o app leria campos que não existem sem nenhum erro.
 *
 * Ela já se pagou. A versão 1 tinha `amount` e `installments`; a 2 guarda as DUAS formas de
 * pagamento, para a diferença entre elas responder "quanto economizo à vista". Um envelope da
 * versão 1 é convertido em vez de descartado — sem a versão, os campos antigos seriam lidos
 * como ausentes e a lista inteira apareceria vazia.
 *
 * **Tornar `month` e `payment` opcionais NÃO pediu uma versão 3**, e a regra que isso ilustra
 * vale para a próxima mudança: versão se paga quando o gravado deixa de ser legível pela forma
 * nova. Aqui todo plano da versão 2 continua válido — ele só tem preenchido o que agora pode
 * faltar. Uma versão cuja migração é a identidade acrescenta um ramo que só pode apodrecer.
 */
export const PLANS_VERSION = 2

export interface PlansData {
  version: number
  groups: PlanGroup[]
  items: Plan[]
}

export function emptyPlans(): PlansData {
  return { version: PLANS_VERSION, groups: [], items: [] }
}

const STATUSES = new Set<PlanStatus>(['considering', 'decided', 'discarded'])
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function month(value: unknown): string | undefined {
  return typeof value === 'string' && MONTH.test(value) ? value : undefined
}

/**
 * Valida o que veio do servidor ou de um arquivo importado.
 *
 * Nada aqui é confiável: o servidor guarda o catálogo como JSON opaco, sem conferir a forma, e o
 * arquivo importado é escolhido pelo usuário. Um item inválido é DESCARTADO em silêncio em vez de derrubar a
 * lista inteira — perder um plano é recuperável, perder o catálogo por causa de um campo
 * torto não é.
 *
 * Categoria desconhecida também invalida: sem ela o plano não teria onde entrar na previsão,
 * e apareceria num total sem aparecer em nenhuma categoria.
 */
export function parsePlans(raw: unknown): PlansData {
  if (!raw || typeof raw !== 'object') return emptyPlans()
  const envelope = raw as { version?: number; groups?: unknown; items?: unknown }
  if (envelope.version !== PLANS_VERSION && envelope.version !== 1) return emptyPlans()
  const legacy = envelope.version === 1

  const groups: PlanGroup[] = []
  for (const value of Array.isArray(envelope.groups) ? envelope.groups : []) {
    const g = value as Partial<PlanGroup>
    const id = text(g.id)
    const label = text(g.label)
    if (!id || !label) continue
    groups.push({ id, label, from: month(g.from), to: month(g.to), note: text(g.note) })
  }

  const known = new Set(groups.map((g) => g.id))
  const items: Plan[] = []
  for (const value of Array.isArray(envelope.items) ? envelope.items : []) {
    const p = value as Partial<Plan> & { amount?: unknown; installments?: unknown }
    const id = text(p.id)
    const label = text(p.label)
    const categoryId = text(p.categoryId)
    // O mês DEGRADA para ausente em vez de invalidar o plano. Agora que "sem mês" é um
    // estado que se pode representar e desenhar, uma data torta vira ele — e não a perda de um
    // plano que tem nome, preço e categoria.
    const at = month(p.month)
    if (!id || !label || !categoryId) continue
    if (!CATEGORY_MAP[categoryId]) continue

    // Parcelamento fora de 2..99 é engano de digitação, não intenção.
    const times = (n: unknown) => (typeof n === 'number' && isInstallmentCount(n) ? n : undefined)
    const price = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined)

    let cash: number | undefined
    let financed: Plan['financed']
    let payment: PaymentMode | undefined
    if (legacy) {
      // Versão 1: um preço só. Parcelado vira o preço financiado — sem desconto conhecido, o
      // à vista recebe o MESMO valor, que é a verdade disponível: ninguém pesquisou o outro.
      const amount = price(p.amount)
      if (amount === undefined) continue
      const count = times(p.installments)
      cash = amount
      financed = count ? { total: amount, installments: count } : undefined
      payment = count ? 'financed' : 'cash'
    } else {
      cash = price(p.cash)
      const f = p.financed as Partial<NonNullable<Plan['financed']>> | undefined
      const total = price(f?.total)
      const count = times(f?.installments)
      financed = total !== undefined && count !== undefined ? { total, installments: count } : undefined
      if (cash === undefined && financed) cash = financed.total
      if (cash === undefined) continue
      // Escolha "parcelado" sem preço parcelado NÃO cai mais para à vista: cai para ausente.
      // Enquanto ausente não existia, à vista era a única alternativa representável; agora que
      // existe, afirmar à vista seria inventar uma decisão que a pessoa não tomou.
      payment = p.payment === 'financed' && financed ? 'financed' : p.payment === 'cash' ? 'cash' : undefined
    }

    const status = STATUSES.has(p.status as PlanStatus) ? (p.status as PlanStatus) : 'considering'
    const groupId = text(p.groupId)
    items.push({ id, label, categoryId, cash, financed, payment, status, month: at, groupId: groupId && known.has(groupId) ? groupId : undefined, note: text(p.note) })
  }
  return { version: PLANS_VERSION, groups, items }
}

/** Id estável sem dependência: a hora mais um sufixo aleatório basta para uma lista local. */
export function planId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * O total que a forma ESCOLHIDA custa. É este o número que a previsão usa.
 *
 * Parcelado sem `financed` cai no preço à vista em vez de virar zero: um plano marcado como
 * parcelado a que ninguém deu preço parcelado ainda é uma compra, e sumir da previsão seria
 * pior do que projetá-la pelo preço que se conhece.
 */
export function planTotal(plan: Plan): number {
  return plan.payment === 'financed' && plan.financed ? plan.financed.total : plan.cash
}

/** Em quantas vezes a forma escolhida se divide. À vista é sempre 1. */
export function planInstallments(plan: Plan): number {
  return plan.payment === 'financed' && plan.financed ? plan.financed.installments : 1
}

/** O valor que cai em CADA mês. */
export function installmentAmount(plan: Plan): number {
  return planTotal(plan) / planInstallments(plan)
}

/**
 * Quanto o à vista economiza: o total parcelado menos o à vista.
 *
 * `null` quando não há as duas formas — sem preço parcelado não existe comparação, e devolver
 * zero afirmaria que os preços são iguais, que é outra coisa.
 */
export function savingOf(plan: Plan): number | null {
  if (!plan.financed) return null
  return Math.round((plan.financed.total - plan.cash) * 100) / 100
}

/**
 * Os meses que um plano ocupa, do mês da compra em diante.
 *
 * À vista é um mês só. Parcelado espalha — e é isso que faz a simulação responder "cabe?" em
 * vez de só "custa quanto?".
 *
 * **Sem mês, nenhum mês.** É AQUI que um desejo sem data fica de fora da previsão, e é por isso
 * que `forecast.ts` não precisou de nenhuma guarda: ele já pergunta `planOccursIn`, que sobre
 * uma lista vazia responde não para todo mês.
 */
export function planMonths(plan: Plan): string[] {
  if (!plan.month) return []
  const out: string[] = []
  for (let i = 0; i < planInstallments(plan); i++) out.push(addMonths(plan.month, i))
  return out
}

/**
 * Aritmética de mês, num lugar só dentro deste módulo.
 *
 * `finance.ts` tem um `shiftMonth` idêntico e ele NÃO é importado aqui de propósito: aquele
 * arquivo carrega `@/generated/*.json` no topo, e `plans.ts` é lido pelos testes, que passariam
 * a depender de um dataset gerado para exercitar aritmética de calendário.
 */
function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export interface PlanScheduleMonth {
  month: string
  /** O que já entra na previsão. */
  decided: number
  /** O que ainda é hipótese. */
  considering: number
}

/**
 * O desembolso mês a mês que os planos produzem, do primeiro ao último — a agenda da lista.
 *
 * **O eixo é de CALENDÁRIO, não dos meses que têm plano.** Sem o preenchimento de zeros a
 * série pularia de outubro para janeiro e os dois meses sem nada sumiriam, em vez de aparecerem
 * vazios; e é justamente a folga entre uma compra e a seguinte que se quer enxergar. É a mesma
 * regra do eixo de proventos do Patrimônio: mês vazio é dado.
 *
 * Descartado fica de fora — é a situação que significa "não vou fazer" — e sem mês também: um
 * plano sem data não tem coluna onde cair, e escolher uma por ele seria inventar a agenda que
 * este gráfico existe para mostrar.
 */
export function planScheduleByMonth(items: Plan[]): PlanScheduleMonth[] {
  const live = items.filter((p) => p.status !== 'discarded' && p.month !== undefined)
  const totals = new Map<string, { decided: number; considering: number }>()

  for (const plan of live) {
    const value = installmentAmount(plan)
    for (const month of planMonths(plan)) {
      const bucket = totals.get(month) ?? { decided: 0, considering: 0 }
      if (plan.status === 'decided') bucket.decided += value
      else bucket.considering += value
      totals.set(month, bucket)
    }
  }
  if (totals.size === 0) return []

  const months = [...totals.keys()].sort()
  const out: PlanScheduleMonth[] = []
  for (let month = months[0]; month <= months[months.length - 1]; month = addMonths(month, 1)) {
    const bucket = totals.get(month) ?? { decided: 0, considering: 0 }
    out.push({ month, ...bucket })
  }
  return out
}

/** Se o plano cai neste mês — à vista, o mês da compra; parcelado, qualquer parcela. */
export function planOccursIn(plan: Plan, month: string): boolean {
  return planMonths(plan).includes(month)
}

/**
 * Os planos que a previsão REAL considera: só os decididos.
 *
 * Em estudo fica de fora por definição — é o que separa o número que você usa para decidir do
 * número que você está testando. A simulação passa a lista maior explicitamente.
 */
export function decidedPlans(items: Plan[]): Plan[] {
  return items.filter((p) => p.status === 'decided')
}

/**
 * Os planos que têm data, e portanto lugar na linha do tempo.
 *
 * Existe para a lacuna não ser silenciosa: o KPI "Decidido" soma TODO decidido, e um decidido
 * sem mês não aparece em previsão nenhuma. Sem esta separação, o total do cartão e o do
 * gráfico divergiriam e nada na tela explicaria por quê.
 */
export function scheduledPlans(items: Plan[]): Plan[] {
  return items.filter((p) => p.month !== undefined)
}
