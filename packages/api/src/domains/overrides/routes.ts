import { oc } from '@orpc/contract'
import { z } from 'zod'
import { overridesMap, transactionId } from './shape'

/**
 * Os ajustes manuais de categoria, por id de transação.
 *
 * A chave é o id DETERMINÍSTICO que o ingest calcula — `sha1` de sete campos, cortado em doze.
 * É por isso que o servidor precisa preservá-lo em vez de gerar um id próprio: um `uuid` novo a
 * cada ingestão apagaria todo ajuste em silêncio.
 *
 * `categoryId` nulo REMOVE o ajuste, e é diferente de não mandar o campo: um é "volte ao que o
 * ingest decidiu", o outro é "não mexi nisto".
 */
export const overridesRoutes = {
  list: oc.route({ method: 'GET', path: '/overrides' }).output(overridesMap),
  set: oc
    .route({ method: 'PUT', path: '/overrides/{transactionId}' })
    .input(z.object({ transactionId, categoryId: z.string().nullable() }))
    .output(overridesMap),
  clear: oc.route({ method: 'DELETE', path: '/overrides' }).output(z.object({ ok: z.literal(true) })),
}
