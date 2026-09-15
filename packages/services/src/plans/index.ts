/**
 * A API pública do contexto de planos.
 *
 * Só reexport (§1). Quem consome — tela ou outro contexto — importa daqui e nunca de um caminho
 * profundo: o que não está reexportado neste arquivo não é público (§4).
 *
 * **A fábrica de conveniência saiu.** Havia duas, e a distinção era o modo local: uma montava o
 * serviço sobre `localStorage`, a outra o recebia injetado. Com o servidor como única origem,
 * quem monta é o composition root da aplicação — e só ele sabe a URL. Uma fábrica sem argumento
 * aqui teria de inventá-la.
 */
export { makePlansService, type PlansService } from './application/plans.service'
export type { GroupStatus, NewGroup, NewPlan, PlanPatch, PlansServiceDeps } from './application/plans.service'
export { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError, PurchaseAlreadyLinkedError } from './domain/errors'
export type { IdGenerator, PlanRepository } from './domain/ports/plan-repository'
export { makeOrpcPlanRepository } from './infrastructure/orpc-plan.adapter'
export { makePlanIdGenerator } from './infrastructure/plan-id.adapter'
