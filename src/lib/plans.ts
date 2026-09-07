import { CATEGORY_MAP } from '@/data/categories'
import type { Plan, PlanGroup, PlanStatus } from '@/data/types'

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
 * Com a versão, um envelope antigo é reconhecível e pode ser convertido ou descartado com
 * aviso, em vez de corromper a leitura.
 */
export const PLANS_VERSION = 1

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
  const envelope = raw as Partial<PlansData>
  if (envelope.version !== PLANS_VERSION) return emptyPlans()

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
    const p = value as Partial<Plan>
    const id = text(p.id)
    const label = text(p.label)
    const categoryId = text(p.categoryId)
    const at = month(p.month)
    if (!id || !label || !categoryId || !at) continue
    if (!CATEGORY_MAP[categoryId]) continue
    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) continue
    const status = STATUSES.has(p.status as PlanStatus) ? (p.status as PlanStatus) : 'considering'
    // Parcelamento fora de 1..99 é engano de digitação, não intenção: cai para à vista.
    const installments = typeof p.installments === 'number' && Number.isInteger(p.installments) && p.installments > 1 && p.installments <= 99 ? p.installments : undefined
    // Grupo que não existe mais deixa o item solto, em vez de sumir com ele.
    const groupId = text(p.groupId)
    items.push({ id, label, categoryId, amount: p.amount, status, month: at, installments, groupId: groupId && known.has(groupId) ? groupId : undefined, note: text(p.note) })
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

/** O valor que cai em CADA mês: o total dividido pelas parcelas. */
export function installmentAmount(plan: Plan): number {
  return plan.amount / (plan.installments ?? 1)
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
  for (let i = 0; i < (plan.installments ?? 1); i++) {
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
