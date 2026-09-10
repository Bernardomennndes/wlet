import { createORPCClient } from '@orpc/client'
import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract'
import { ResponseValidationPlugin } from '@orpc/contract/plugins'
import { OpenAPILink } from '@orpc/openapi-client/fetch'

export interface ClientOptions {
  /** A origem mais o prefixo do canal: `https://host/v1`. */
  baseUrl: string
  /** Lido a cada chamada, não capturado uma vez: o token expira e é renovado por fora. */
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
  const link = new OpenAPILink(contract, {
    url: baseUrl,
    headers: () => {
      const value = token?.()
      return value ? { Authorization: `Bearer ${value}` } : {}
    },
    plugins: [new ResponseValidationPlugin(contract)],
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
  return createORPCClient<ContractRouterClient<T>>(link)
}
