import { makePlansService, type PlansService } from './application/plans.service'
import { makeIdGenerator, makeLocalStoragePlanRepository } from './infrastructure/local-storage-plan.adapter'

/**
 * A API pública do contexto de planos.
 *
 * Só factory e reexport (§1). Quem consome — tela ou outro contexto — importa daqui e nunca de
 * um caminho profundo: o que não está reexportado neste arquivo não é público (§4).
 *
 * Duas factories, e a distinção é proposital: `makePlansService(deps)` é o serviço INJETÁVEL,
 * que os testes montam sobre fakes; `createPlansService()` é ele já ligado ao armazenamento
 * real. Sem as duas, ou o teste precisa de navegador, ou a tela precisa saber montar adapter.
 *
 * **Armazenamento: `localStorage`** (§7). O catálogo tem ordem de KB, cabe num envelope só e é
 * rascunho por navegador. O critério completo está no adapter.
 */
export function createPlansService(): PlansService {
  return makePlansService({ repository: makeLocalStoragePlanRepository(), ids: makeIdGenerator() })
}

export { makePlansService, type PlansService } from './application/plans.service'
export type { NewGroup, NewPlan, PlanPatch, PlansServiceDeps } from './application/plans.service'
export { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError } from './domain/errors'
export type { IdGenerator, PlanRepository } from './domain/ports/plan-repository'
export { makeIdGenerator, makeLocalStoragePlanRepository } from './infrastructure/local-storage-plan.adapter'
export { makeOrpcPlanRepository } from './infrastructure/orpc-plan.adapter'
