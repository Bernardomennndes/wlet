import { createWletAuthClient } from '@wlet/auth/client'
import { apiOrigin } from './api-url'

/**
 * O cliente de autenticação do app, numa instância só.
 *
 * Ele fala com o `/api/auth/*` que `apps/api` monta, e a sessão que ele cria é um cookie
 * `httpOnly` — o app nunca a lê, e é esse o ponto: script nenhum consegue, inclusive o de um
 * XSS. Quem prova que a sessão existe é o servidor, a cada chamada.
 */
let instancia: ReturnType<typeof createWletAuthClient> | null = null

/** Memoizado: o cliente guarda estado de sessão, e dois deles divergiriam em silêncio. */
export function auth() {
  instancia ??= createWletAuthClient(apiOrigin())
  return instancia
}
