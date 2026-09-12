import { createWletAuthClient } from '@wlet/auth/client'

/**
 * O cliente de autenticação do app, numa instância só.
 *
 * Ele fala com o `/api/auth/*` que `apps/api` monta, e a sessão que ele cria é um cookie
 * `httpOnly` — o app nunca a lê, e é esse o ponto: script nenhum consegue, inclusive o de um
 * XSS. Quem prova que a sessão existe é o servidor, a cada chamada.
 *
 * A URL sai do MESMO lugar que a do contrato, e não de uma variável própria: duas variáveis para
 * o mesmo servidor divergem no primeiro deploy, e o sintoma seria login que funciona e dado que
 * volta 401 — ou o contrário. `VITE_API_URL` aponta para a origem mais o canal (`/v1`); o Better
 * Auth mora na RAIZ da mesma origem, então o `/v1` sai aqui.
 */
function origemDaApi(): string {
  const url = (import.meta.env as Record<string, string> | undefined)?.VITE_API_URL
  if (!url) throw new Error('VITE_API_URL não definida: sem ela o app não sabe com que servidor falar.')
  return url.replace(/\/v1\/?$/, '')
}

let instancia: ReturnType<typeof createWletAuthClient> | null = null

/** Memoizado: o cliente guarda estado de sessão, e dois deles divergiriam em silêncio. */
export function auth() {
  instancia ??= createWletAuthClient(origemDaApi())
  return instancia
}
