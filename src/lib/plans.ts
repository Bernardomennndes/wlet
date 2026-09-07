import { CATEGORY_MAP } from '@/data/categories'
import type { PaymentMode, Plan, PlanGroup, PlanStatus } from '@/data/types'

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

export const PLANS_KEY = 'wallet.plans'

/**
 * O envelope é VERSIONADO desde o primeiro dia.
 *
 * Dado em `localStorage` não tem migração se nascer sem versão: quando a forma mudar, o que
 * está gravado vira lixo silencioso — e o app leria campos que não existem sem nenhum erro.
 *
 * Ela já se pagou. A versão 1 tinha `amount` e `installments`; a 2 guarda as DUAS formas de
 * pagamento, para a diferença entre elas responder "quanto economizo à vista". Um envelope da
 * versão 1 é convertido em vez de descartado — sem a versão, os campos antigos seriam lidos
 * como ausentes e a lista inteira apareceria vazia.
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
 * Valida o que veio do navegador ou de um arquivo importado.
 *
 * Nada aqui é confiável: `localStorage` pode ter sido editado à mão, e o arquivo importado é
 * escolhido pelo usuário. Um item inválido é DESCARTADO em silêncio em vez de derrubar a
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
    const at = month(p.month)
    if (!id || !label || !categoryId || !at) continue
    if (!CATEGORY_MAP[categoryId]) continue

    // Parcelamento fora de 2..99 é engano de digitação, não intenção.
    const times = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n > 1 && n <= 99 ? n : undefined)
    const price = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined)

    let cash: number | undefined
    let financed: Plan['financed']
    let payment: PaymentMode
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
      // Escolha "parcelado" sem preço parcelado cai para à vista: um estado que não se pode
      // desenhar não deve sobreviver à leitura.
      payment = p.payment === 'financed' && financed ? 'financed' : 'cash'
    }

    const status = STATUSES.has(p.status as PlanStatus) ? (p.status as PlanStatus) : 'considering'
    const groupId = text(p.groupId)
    items.push({ id, label, categoryId, cash, financed, payment, status, month: at, groupId: groupId && known.has(groupId) ? groupId : undefined, note: text(p.note) })
  }
  return { version: PLANS_VERSION, groups, items }
}

export function readPlans(): PlansData {
  try {
    const raw = localStorage.getItem(PLANS_KEY)
    return raw ? parsePlans(JSON.parse(raw)) : emptyPlans()
  } catch {
    return emptyPlans()
  }
}

export function writePlans(data: PlansData) {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(data))
  } catch {
    // armazenamento indisponível: segue sem persistir
  }
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
 */
export function planMonths(plan: Plan): string[] {
  const out: string[] = []
  const [y, m] = plan.month.split('-').map(Number)
  for (let i = 0; i < planInstallments(plan); i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
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
