import { implement } from '@orpc/server'
import { wletContract } from '@wlet/api/contract'

/**
 * O que todo handler recebe além da entrada.
 *
 * `userId` é o eixo multi-tenant e não é opcional depois da autenticação: TODA consulta ao banco
 * o carrega. Um handler que esqueça de filtrar por ele devolve o extrato de outra pessoa, e não
 * há teste de tela que pegue isso — por isso ele entra pelo contexto e não por parâmetro, onde
 * seria possível omiti-lo sem o compilador reclamar.
 */
export interface Context {
  userId: string
}

/** O implementador do contrato: é ele que amarra cada handler à rota declarada em `@wlet/api`. */
export const os = implement(wletContract).$context<Context>()

/**
 * A procedure autenticada.
 *
 * Hoje ela só afirma que o `userId` existe. Quando o `@wlet/auth` entrar, é aqui que o token
 * vira identidade — num lugar só, e não espalhado por trinta handlers.
 */
export const authed = os.use(({ context, next }) => {
  if (!context.userId) throw new Error('UNAUTHORIZED')
  return next({ context })
})
