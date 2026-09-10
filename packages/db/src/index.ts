import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

export * from './schema/index'
export { and, asc, count, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm'

/**
 * A conexão.
 *
 * `prepare: false` porque o pool de conexões de um serviço gerenciado (PgBouncer em modo
 * transação, que é o padrão de Neon e Supabase) não sobrevive a prepared statements — o sintoma
 * é um erro intermitente que só aparece sob concorrência, e é o tipo de coisa que não se
 * descobre em desenvolvimento.
 */
export function createDb(url: string) {
  const client = postgres(url, { prepare: false })
  const db = drizzle(client, { schema })
  /**
   * O pool NÃO fecha sozinho, e um processo que termina o trabalho fica pendurado esperando por
   * ele — foi o que travou a suíte do servidor. `close` é exposto no próprio objeto para quem
   * tem um fim (teste, script, tarefa) poder encerrá-lo sem alcançar o cliente por baixo.
   */
  return Object.assign(db, { close: () => client.end({ timeout: 5 }) })
}

export type Db = ReturnType<typeof createDb>
