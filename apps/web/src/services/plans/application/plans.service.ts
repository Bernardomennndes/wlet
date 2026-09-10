import type { Plan, PlanGroup, PlanStatus, PaymentMode } from '@/data/types'
import { type PlansData, planScheduleByMonth, type PlanScheduleMonth, scheduledPlans } from '@/lib/plans'
import { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError } from '../domain/errors'
import type { IdGenerator, PlanRepository } from '../domain/ports/plan-repository'

/**
 * Os casos de uso do catálogo de planos.
 *
 * O serviço ORQUESTRA (§5): a aritmética de plano — total, parcela, meses que ele ocupa,
 * agenda — já existe pura em `src/lib/plans.ts`, é testada lá e é lida por telas que não
 * passam por aqui. Reimplementá-la produziria dois números para a mesma pergunta, que é
 * exatamente o que o `CLAUDE.md` proíbe ao dizer que previsão é UM número no app inteiro.
 *
 * Todo caso de uso que escreve lê o catálogo, altera em memória e grava o INTEIRO de volta —
 * §3, a atomicidade pela forma.
 */
export interface PlansServiceDeps {
  repository: PlanRepository
  ids: IdGenerator
}

export interface PlansService {
  list(): Promise<PlansData>
  schedule(): Promise<PlanScheduleMonth[]>
  addPlan(input: NewPlan): Promise<Plan>
  updatePlan(id: string, patch: PlanPatch): Promise<Plan>
  removePlan(id: string): Promise<void>
  setStatus(id: string, status: PlanStatus): Promise<Plan>
  setPayment(id: string, payment: PaymentMode | undefined): Promise<Plan>
  setMonth(id: string, month: string | undefined): Promise<Plan>
  addGroup(input: NewGroup): Promise<PlanGroup>
  removeGroup(id: string): Promise<void>
  /**
   * Substitui o catálogo inteiro — é o caminho da IMPORTAÇÃO de um arquivo exportado.
   *
   * Não valida item a item de propósito: quem chama já passou o conteúdo por `parsePlans`, que
   * é o mesmo parser da leitura e descarta o inválido em silêncio. Revalidar aqui produziria
   * uma segunda opinião sobre o que é um plano válido, e as duas divergiriam no primeiro campo
   * novo (§10).
   */
  replaceAll(data: PlansData): Promise<PlansData>
}

export type NewPlan = Omit<Plan, 'id' | 'status'> & { status?: PlanStatus }
export type PlanPatch = Partial<Omit<Plan, 'id'>>
export type NewGroup = Omit<PlanGroup, 'id'>

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function assertValid(plan: Plan): void {
  if (!plan.label.trim()) throw new InvalidPlanError('O plano precisa de um nome.')
  if (!(plan.cash >= 0)) throw new InvalidPlanError('O preço à vista não pode ser negativo.')
  if (plan.financed && !(plan.financed.total >= 0)) throw new InvalidPlanError('O preço parcelado não pode ser negativo.')
  if (plan.financed && plan.financed.installments < 1) throw new InvalidPlanError('Um plano parcelado precisa de pelo menos uma parcela.')
  if (plan.month !== undefined && !MONTH.test(plan.month)) throw new InvalidPlanError('O mês deve estar no formato AAAA-MM.')
}

/**
 * Parcelado sem preço parcelado recua para NÃO DECIDIDO.
 *
 * É a regra que o `CLAUDE.md` já declara para a leitura e o formulário, trazida para o único
 * lugar que agora escreve: escolher "parcelado" sem ter o preço parcelado é um estado que não
 * se pode desenhar. Recuar para ausente é diferente de recuar para à vista — afirmar à vista
 * inventaria uma decisão que ninguém tomou.
 */
function normalizePayment(plan: Plan): Plan {
  if (plan.payment === 'financed' && !plan.financed) {
    const { payment: _dropped, ...rest } = plan
    return rest
  }
  return plan
}

export function makePlansService({ repository, ids }: PlansServiceDeps): PlansService {
  /** Lê, aplica, grava o catálogo inteiro e devolve o que a alteração produziu. */
  async function mutate<T>(apply: (data: PlansData) => { next: PlansData; result: T }): Promise<T> {
    const data = await repository.findAll()
    const { next, result } = apply(data)
    await repository.save(next)
    return result
  }

  function locate(data: PlansData, id: string): Plan {
    const plan = data.items.find((item) => item.id === id)
    if (!plan) throw new PlanNotFoundError()
    return plan
  }

  /** Um patch sobre um plano, já normalizado e validado. Único caminho de escrita de item (§10). */
  function patched(data: PlansData, id: string, patch: PlanPatch): { next: PlansData; result: Plan } {
    const current = locate(data, id)
    const merged = normalizePayment({ ...current, ...patch })
    assertValid(merged)
    return { next: { ...data, items: data.items.map((item) => (item.id === id ? merged : item)) }, result: merged }
  }

  return {
    list: () => repository.findAll(),

    async schedule() {
      // Delega ao kernel. `scheduledPlans` já descarta o descartado e o que não tem mês.
      const { items } = await repository.findAll()
      return planScheduleByMonth(scheduledPlans(items))
    },

    addPlan(input) {
      return mutate((data) => {
        // Nasce em `considering`: um plano recém-anotado não foi decidido, e nascer decidido
        // afirmaria por quem o anotou — a mesma razão de `payment` e `month` serem opcionais.
        const plan = normalizePayment({ ...input, id: ids.next('plan'), status: input.status ?? 'considering' })
        assertValid(plan)
        if (plan.groupId && !data.groups.some((g) => g.id === plan.groupId)) throw new PlanGroupNotFoundError()
        return { next: { ...data, items: [...data.items, plan] }, result: plan }
      })
    },

    updatePlan: (id, patch) => mutate((data) => patched(data, id, patch)),
    setStatus: (id, status) => mutate((data) => patched(data, id, { status })),
    setPayment: (id, payment) => mutate((data) => patched(data, id, { payment })),
    setMonth: (id, month) => mutate((data) => patched(data, id, { month })),

    removePlan(id) {
      return mutate((data) => {
        locate(data, id)
        return { next: { ...data, items: data.items.filter((item) => item.id !== id) }, result: undefined }
      })
    },

    addGroup(input) {
      return mutate((data) => {
        const group: PlanGroup = { ...input, id: ids.next('group') }
        if (!group.label.trim()) throw new InvalidPlanError('O grupo precisa de um nome.')
        return { next: { ...data, groups: [...data.groups, group] }, result: group }
      })
    },

    /**
     * Apagar o grupo NÃO apaga os planos dele — eles só perdem o vínculo.
     *
     * Grupo é organização, não posse: quem desfaz um agrupamento está dizendo que a divisão
     * deixou de servir, não que as compras foram canceladas. Levar os planos junto destruiria
     * pesquisa de preço por causa de uma arrumação.
     */
    async replaceAll(data) {
      await repository.save(data)
      return data
    },

    removeGroup(id) {
      return mutate((data) => {
        if (!data.groups.some((g) => g.id === id)) throw new PlanGroupNotFoundError()
        const items = data.items.map((item) => {
          if (item.groupId !== id) return item
          const { groupId: _dropped, ...rest } = item
          return rest
        })
        return { next: { groups: data.groups.filter((g) => g.id !== id), items, version: data.version }, result: undefined }
      })
    },
  }
}
