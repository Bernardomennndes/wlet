import { createDb, type Db, eq, users } from '@wlet/db'
import { createAuth } from '@wlet/auth'
import { loadRootEnv } from '@wlet/env'

/**
 * O banco dos testes.
 *
 * É o MESMO Postgres do desenvolvimento, e cada teste cria o seu próprio usuário: o isolamento
 * vem do `userId`, que é o eixo de todo o schema. Testar assim não é atalho — é exercitar
 * justamente a garantia que mais importa aqui, a de que uma pessoa não enxerga o dado de outra.
 */
// A suíte lê o mesmo `.env` da raiz que o servidor: exigir a variável exportada à mão antes de
// rodar os testes seria um segundo jeito de configurar a mesma coisa.
loadRootEnv()

export const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://wlet:wlet@localhost:5433/wlet'

/**
 * A suíte precisa de um Postgres, e o `docker compose up -d` sobe um na 5433.
 *
 * Declarado aqui em vez de a suíte falhar com "connection refused": um erro de conexão no meio
 * de uma bateria parece defeito do código, e não ambiente faltando.
 */
export const COMO_SUBIR = 'A suíte precisa de um Postgres. Rode `docker compose up -d` na raiz e `pnpm --filter @wlet/db db:migrate`.'

export function db(): Db {
  return createDb(url)
}

/** O mesmo Better Auth do servidor — testar contra outro seria testar outra coisa. */
export function auth(d: Db) {
  return createAuth(d, { baseURL: 'http://localhost:8787', secret: 'segredo-de-teste-nao-usar-em-producao', trustedOrigins: ['http://localhost:4300'] })
}

let contador = 0

/**
 * Um usuário novo por teste, criado pelo FLUXO REAL de cadastro.
 *
 * Inserir direto na tabela seria mais rápido e testaria menos: a senha não passaria pelo hash,
 * a credencial não nasceria em `auth_accounts`, e a sessão não viria do mesmo caminho que a de
 * produção.
 */
export async function novoUsuario(d: Db): Promise<{ userId: string; token: string; email: string }> {
  contador += 1
  const email = `t${Date.now().toString(36)}-${contador}@teste.local`
  const senha = 'senha-de-teste-longa'
  const r = await auth(d).api.signUpEmail({ body: { email, password: senha, name: 'Teste' } })
  const [row] = await d.select({ id: users.id }).from(users).where(eq(users.email, email))
  return { userId: row.id, token: r.token ?? '', email }
}

/** Apaga o usuário — e, por cascata, tudo o que era dele. É o que o `onDelete: cascade` promete. */
export async function limpar(d: Db, userId: string): Promise<void> {
  await d.delete(users).where(eq(users.id, userId))
}
