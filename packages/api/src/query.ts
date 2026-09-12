import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import type { WletClient } from './clients/wlet'

/**
 * O contrato, visto pelo React Query.
 *
 * A ponte não gera chave de cache nova: ela DERIVA a chave do caminho da procedure mais o input,
 * e é isso que faz duas telas que peçam a mesma leitura com o mesmo input lerem a mesma entrada,
 * sem combinarem nada entre si. Chave escrita à mão ao lado disto cria uma segunda entrada para a
 * mesma leitura, e o compartilhamento morre em silêncio — por isso a regra proíbe.
 *
 * Recebe o cliente JÁ MONTADO em vez de montar um: quem sabe a URL é o composition root da
 * aplicação, e dois clientes para o mesmo servidor significariam duas configurações de credencial
 * livres para divergir.
 */
export function createWletQueryUtils(client: WletClient) {
  return createTanstackQueryUtils(client)
}

export type WletQueryUtils = ReturnType<typeof createWletQueryUtils>
