import { oc } from '@orpc/contract'
import { z } from 'zod'
import { plan, planGroup, plansData } from './shape'

/**
 * O catálogo de planos de compra.
 *
 * Ao contrário de `config`, aqui a escrita é por ITEM: um plano é uma entidade com id próprio, e
 * a lista não tem regra que ligue um ao outro — nada que só o conjunto possa recusar. Foi assim
 * que o provider do navegador sempre funcionou (`updatePlan(id, patch)`), e é o que evita a
 * corrida de duas edições sobrescrevendo uma à outra.
 */
export const plansRoutes = {
  list: oc.route({ method: 'GET', path: '/plans' }).output(plansData),

  add: oc
    .route({ method: 'POST', path: '/plans' })
    .input(plan.omit({ id: true }))
    .output(plansData),
  update: oc
    .route({ method: 'PATCH', path: '/plans/{id}' })
    .input(z.object({ id: z.string(), patch: plan.omit({ id: true }).partial() }))
    .output(plansData),
  remove: oc
    .route({ method: 'DELETE', path: '/plans/{id}' })
    .input(z.object({ id: z.string() }))
    .output(plansData),

  addGroup: oc
    .route({ method: 'POST', path: '/plans/groups' })
    .input(planGroup.omit({ id: true }))
    .output(plansData),
  /** Apagar um grupo NÃO apaga os planos dele — a regra vive no serviço, e o teste dela também. */
  removeGroup: oc
    .route({ method: 'DELETE', path: '/plans/groups/{id}' })
    .input(z.object({ id: z.string() }))
    .output(plansData),

  replaceAll: oc.route({ method: 'PUT', path: '/plans' }).input(plansData).output(plansData),
}
