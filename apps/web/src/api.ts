import { createWletClient, createWletQueryUtils, type WletClient } from '@wlet/api'
import { apiUrl } from './api-url'

/**
 * O cliente do contrato, numa instância só — e o `api` que o React Query enxerga.
 *
 * **Um cliente, não dois.** `services()` monta os cinco contextos sobre ele e as telas pedem
 * leitura por `api.*.queryOptions()` sobre o MESMO objeto. Dois clientes para o mesmo servidor
 * seriam duas configurações de credencial livres para divergir, e o sintoma — uma metade do app
 * autenticada e a outra não — só apareceria em produção.
 *
 * Criado SOB DEMANDA porque `apiUrl()` lança quando a variável falta: fazer isso na avaliação do
 * módulo transformaria um erro de configuração numa página em branco, já que o import acontece
 * antes de qualquer `catch` existir.
 */
let cliente: WletClient | null = null

export function client(): WletClient {
  // O token é para quem NÃO tem navegador (teste e script, pelo plugin `bearer()`); a sessão do
  // app é o cookie `httpOnly`, que viaja sozinho.
  cliente ??= createWletClient({ baseUrl: apiUrl(), token: () => localStorage.getItem('wlet.token') })
  return cliente
}

let utils: ReturnType<typeof createWletQueryUtils> | null = null

/**
 * O contrato visto pelo React Query: `api.<grupo>.<procedure>.queryOptions({ input })`.
 *
 * É uma FUNÇÃO e não uma constante exportada pela mesma razão que `client()` é: montá-la na
 * avaliação do módulo leria o ambiente cedo demais.
 */
export function api(): ReturnType<typeof createWletQueryUtils> {
  utils ??= createWletQueryUtils(client())
  return utils
}

/** Descarta as instâncias. Existe para o teste, e para um "reiniciar" futuro não vazar estado. */
export function resetApi(): void {
  cliente = null
  utils = null
}
