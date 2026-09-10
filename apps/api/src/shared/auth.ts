import { and, type Db, eq, gt, sessions, users } from '@wlet/db'

/**
 * Resolve o portador do token numa identidade.
 *
 * Devolve `null` em vez de lançar: quem decide o que fazer com a ausência é a camada de cima —
 * uma rota pública trata diferente de uma protegida, e um erro aqui tiraria essa escolha dela.
 *
 * O prazo é conferido no BANCO (`gt(expiresAt, agora)`) e não em memória: uma sessão expirada
 * não pode depender de o servidor ter reiniciado ou não.
 */
export async function resolveSession(db: Db, header: string | undefined): Promise<string | null> {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return null
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
  return row?.userId ?? null
}

/** Trinta dias. Longo o suficiente para não irritar, curto o suficiente para expirar sozinha. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Cria uma sessão para um e-mail, criando o usuário se ele não existir.
 *
 * É o ponto de entrada de DESENVOLVIMENTO, e está declarado como tal: não há senha nem
 * verificação de e-mail. Quando um provedor de identidade entrar, é esta função que ele
 * substitui — o resto do servidor só conhece `resolveSession`, e não muda.
 */
export async function createSession(db: Db, email: string): Promise<{ token: string; expiresAt: Date }> {
  const [user] = await db.insert(users).values({ email }).onConflictDoUpdate({ target: users.email, set: { email } }).returning({ id: users.id })
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + DURACAO_MS)
  await db.insert(sessions).values({ token, userId: user.id, expiresAt })
  return { token, expiresAt }
}
