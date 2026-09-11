import { createAuthClient } from 'better-auth/client'

/**
 * O cliente de autenticação, para o app.
 *
 * Ele fala com o `/api/auth/*` do servidor e guarda a sessão em COOKIE, não em `localStorage`:
 * um cookie `httpOnly` não é legível por script, então um XSS na página não leva a sessão junto.
 * Num app que mostra extrato bancário inteiro, essa diferença é o que separa um defeito de um
 * vazamento.
 */
export function createWletAuthClient(baseURL: string) {
  return createAuthClient({ baseURL })
}

export type WletAuthClient = ReturnType<typeof createWletAuthClient>
