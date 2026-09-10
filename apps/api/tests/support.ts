import { createDb, type Db, eq, sessions, users } from '@wlet/db'
import { createSession } from '../src/shared/auth'

/**
 * O banco dos testes.
 *
 * É o MESMO Postgres do desenvolvimento, e cada teste cria o seu próprio usuário: o isolamento
 * vem do `userId`, que é o eixo de todo o schema. Testar assim não é atalho — é exercitar
 * justamente a garantia que mais importa aqui, a de que uma pessoa não enxerga o dado de outra.
 *
 * `TEST_DATABASE_URL` tem precedência para o dia em que a suíte rodar contra um banco próprio.
 */
export const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://wlet:wlet@localhost:5433/wlet'

/**
 * A suíte precisa de um Postgres, e o `docker compose up -d` sobe um na 5433.
 *
 * Isso é declarado aqui em vez de a suíte falhar com "connection refused": um erro de conexão
 * no meio de uma bateria de testes parece defeito do código, e não ambiente faltando.
 */
export const COMO_SUBIR = 'A suíte precisa de um Postgres. Rode `docker compose up -d` na raiz e `pnpm --filter @wlet/db db:migrate`.'

export function db(): Db {
  return createDb(url)
}

let contador = 0

/** Um usuário novo por teste, com sessão pronta. O e-mail é único para não colidir. */
export async function novoUsuario(d: Db): Promise<{ userId: string; token: string; email: string }> {
  contador += 1
  const email = `t${Date.now().toString(36)}-${contador}@teste.local`
  const { token } = await createSession(d, email)
  const [row] = await d.select({ id: users.id }).from(users).where(eq(users.email, email))
  return { userId: row.id, token, email }
}

/** Apaga o usuário — e, por cascata, tudo o que era dele. É o que o `onDelete: 'cascade'` promete. */
export async function limpar(d: Db, userId: string): Promise<void> {
  await d.delete(sessions).where(eq(sessions.userId, userId))
  await d.delete(users).where(eq(users.id, userId))
}
