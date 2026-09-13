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
let cachedClient: WletClient | null = null

export function client(): WletClient {
  /**
   * **Sem `token`, e isso é o certo para o APP.** A sessão dele é o cookie `httpOnly`, que viaja
   * sozinho em toda chamada (`packages/api/src/client.ts` embrulha o `fetch` com
   * `credentials: 'include'` justamente para isso). A opção `token` continua existindo e serve a
   * quem NÃO tem navegador — teste e script passam o próprio callback, pelo plugin `bearer()`.
   *
   * Havia aqui `token: () => localStorage.getItem('wlet.token')`, e ela não era inofensiva. Nada
   * no projeto escreve `wlet.token`, então a leitura só podia devolver `null`; e ela roda dentro
   * do `headers()` do link, ou seja **a cada requisição**. Num navegador que bloqueia
   * armazenamento — Safari privado, "bloquear todos os cookies" — o acessador LANÇA, medido:
   * `SecurityError: The operation is insecure.`. O app inteiro pararia de falar com o servidor por
   * causa de um token que nunca existiu. `sidebarDefaultOpen()`, no `app-shell`, já trata essa
   * possibilidade com `try`/`catch` para o cookie; aqui não havia nenhum.
   */
  cachedClient ??= createWletClient({ baseUrl: apiUrl() })
  return cachedClient
}

let cachedUtils: ReturnType<typeof createWletQueryUtils> | null = null

/**
 * O contrato visto pelo React Query: `api.<grupo>.<procedure>.queryOptions({ input })`.
 *
 * É uma FUNÇÃO e não uma constante exportada pela mesma razão que `client()` é: montá-la na
 * avaliação do módulo leria o ambiente cedo demais.
 */
export function api(): ReturnType<typeof createWletQueryUtils> {
  cachedUtils ??= createWletQueryUtils(client())
  return cachedUtils
}

/** Descarta as instâncias. Existe para o teste, e para um "reiniciar" futuro não vazar estado. */
export function resetApi(): void {
  cachedClient = null
  cachedUtils = null
}
