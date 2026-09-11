import type { Auth } from '@wlet/auth'

/**
 * Resolve o portador da requisição numa identidade.
 *
 * A leitura passa a ser do Better Auth, que aceita as DUAS formas: o cookie de sessão, que o app
 * usa, e o `Authorization: Bearer`, que um script ou um teste usam — este segundo só existe por
 * causa do plugin `bearer`, ligado no pacote. Os dois levam à MESMA sessão: dois caminhos de
 * autenticar com estados separados seriam a duplicação de sempre.
 *
 * Devolve `null` em vez de lançar: quem decide o que fazer com a ausência é a camada de cima —
 * uma rota pública trata diferente de uma protegida, e um erro aqui tiraria essa escolha dela.
 */
export async function resolveSession(auth: Auth, headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers })
  return session?.user?.id ?? null
}
