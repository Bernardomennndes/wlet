import { createAuthClient } from 'better-auth/client'

/**
 * O cliente de autenticação, para o app.
 *
 * Ele fala com o `/api/auth/*` do servidor e guarda a sessão em COOKIE, não em `localStorage`:
 * um cookie `httpOnly` não é legível por script, então um XSS na página não leva a sessão junto.
 * Num app que mostra extrato bancário inteiro, essa diferença é o que separa um defeito de um
 * vazamento.
 */
export function createWletAuthClient(baseUrl: string) {
  // O `baseURL` em caixa mista é o nome da OPÇÃO do `better-auth`, e ele fica aqui, na fronteira:
  // a sigla vira palavra no nosso identificador (`baseUrl`) e só volta à forma da biblioteca no
  // objeto que sai daqui. Repassar o nome dela para dentro faria a caixa dela virar a nossa.
  return createAuthClient({ baseURL: baseUrl })
}

export type WletAuthClient = ReturnType<typeof createWletAuthClient>
