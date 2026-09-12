import { oc } from '@orpc/contract'
import { preferencesShape } from './shape'

/**
 * O recorte, o período e o tema — lidos juntos e gravados por partes.
 *
 * O `PATCH` é parcial de propósito: mexer no tema não pode apagar o período que a pessoa
 * escolheu, e mandar o agregado inteiro do cliente abriria essa janela.
 */
export const preferencesRoutes = {
  get: oc.route({ method: 'GET', path: '/preferences' }).output(preferencesShape),
  set: oc.route({ method: 'PATCH', path: '/preferences' }).input(preferencesShape.partial()).output(preferencesShape),
}
