import type { PlansData } from '@wlet/domain/plans'
import type { RemoteDeps } from '../../shared/infrastructure/orpc'
import type { PlanRepository } from '../domain/ports/plan-repository'

/**
 * O catálogo de planos, no servidor.
 *
 * A porta grava o catálogo INTEIRO porque nasceu do `localStorage`, onde não há transação e a
 * única escrita segura é o envelope completo. Aqui existe transação, e o `PUT /plans` a usa —
 * então a mesma chamada que era um remédio contra a falta de atomicidade passa a ser exatamente
 * o que o servidor faz de melhor.
 */
export function makeOrpcPlanRepository({ client }: RemoteDeps): PlanRepository {
  return {
    async findAll() {
      return (await client.plans.list()) as PlansData
    },
    async save(data) {
      await client.plans.replaceAll(data as never)
    },
  }
}
