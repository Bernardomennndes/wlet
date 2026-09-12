import { createORPCClient } from '@orpc/client'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import { ResponseValidationPlugin } from '@orpc/contract/plugins'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

export interface ClientOptions {
  /** A origem mais o prefixo do canal: `https://host/v1`. */
  baseUrl: string
  /**
   * Token para quem NÃO tem navegador — teste e script, pelo plugin `bearer()`.
   *
   * O app não usa: a sessão dele é o cookie `httpOnly`, que viaja sozinho. Lido a cada chamada
   * e não capturado uma vez, porque o token expira e é renovado por fora.
   */
  token?: () => string | null
  fetch?: typeof globalThis.fetch
}

/**
 * O cliente do contrato.
 *
 * O `ResponseValidationPlugin` não é zelo: sem ele, um servidor que mude um campo devolve algo
 * que o TypeScript jura ser do tipo certo e que quebra em runtime três telas adiante. Com ele, a
 * divergência aparece na fronteira, com o nome do campo.
 */
export function createApiClient<T extends AnyContractRouter>(contract: T, { baseUrl, token, fetch: fetchImpl }: ClientOptions): ContractRouterClient<T> {
  /**
   * O cookie da sessão viaja em TODA chamada, e é por isso que o `fetch` é embrulhado.
   *
   * A sessão do Better Auth vive num cookie `httpOnly` — decisão declarada em
   * `@wlet/auth/client`, e o motivo está lá: num app que mostra extrato bancário inteiro, um
   * cookie que script nenhum lê é o que separa um defeito de um vazamento. Mas `httpOnly`
   * significa que o navegador só o envia se a requisição pedir, e cross-origin ele só vai com
   * `credentials: 'include'`. Sem esta linha o cookie existe, o servidor exige sessão e toda
   * chamada volta 401 — sem nada no console dizendo que faltou uma credencial.
   *
   * O `Authorization: Bearer` continua, e não é redundância: o plugin `bearer()` existe para
   * teste e script, que não têm navegador nem cookie. Os dois caminhos levam à MESMA sessão.
   */
  const base = fetchImpl ?? globalThis.fetch
  const comCredencial: typeof globalThis.fetch = (input, init) => base(input, { ...init, credentials: 'include' })

  const link = new OpenAPILink(contract, {
    url: baseUrl,
    headers: () => {
      const value = token?.()
      return value ? { Authorization: `Bearer ${value}` } : {}
    },
    plugins: [new ResponseValidationPlugin(contract)],
    fetch: comCredencial,
  })
  return createORPCClient<ContractRouterClient<T>>(link)
}
