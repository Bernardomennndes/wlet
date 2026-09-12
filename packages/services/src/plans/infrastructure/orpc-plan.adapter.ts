import type { PlansData } from '@wlet/domain/plans'
import { remote, type RemoteDeps } from '../../shared/infrastructure/orpc'
import type { PlanRepository } from '../domain/ports/plan-repository'

/**
 * O catálogo de planos, no servidor.
 *
 * A porta grava o catálogo INTEIRO porque nasceu de um armazenamento sem transação, onde a única
 * escrita segura era o envelope completo. Aqui existe transação, e o `PUT /plans` a usa — então a
 * mesma chamada que era remédio contra a falta de atomicidade passa a ser exatamente o que o
 * servidor faz de melhor.
 */
export function makeOrpcPlanRepository({ client }: RemoteDeps): PlanRepository {
  return {
    findAll() {
      return remote(async () => (await client.plans.list()) as PlansData)
    },
    async save(data) {
      await remote(() => client.plans.replaceAll(data as never))
    },
  }
}
