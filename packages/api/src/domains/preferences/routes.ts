import { oc } from '@orpc/contract'
import { z } from 'zod'
import { month, scope } from '../../shared/shape'

/**
 * O que a pessoa escolheu na barra: recorte, período e tema.
 *
 * Os três aceitam NULO, e isso não é o mesmo que um padrão: nulo quer dizer "nunca escolheu", e
 * é o que permite ao app aplicar o padrão calculado (o período vai até o horizonte de projeção)
 * sem afirmar uma escolha que ninguém fez.
 */
export const preferencesShape = z.object({
  scope: scope.nullable(),
  period: z.object({ from: month, to: month }).nullable(),
  theme: z.enum(['claro', 'escuro']).nullable(),
})

export const preferencesRoutes = {
  get: oc.route({ method: 'GET', path: '/preferences' }).output(preferencesShape),
  set: oc.route({ method: 'PATCH', path: '/preferences' }).input(preferencesShape.partial()).output(preferencesShape),
}
