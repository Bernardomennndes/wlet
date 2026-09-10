import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

export * from './schema/index'
export { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

/**
 * A conexão.
 *
 * `prepare: false` porque o pool de conexões de um serviço gerenciado (PgBouncer em modo
 * transação, que é o padrão de Neon e Supabase) não sobrevive a prepared statements — o sintoma
 * é um erro intermitente que só aparece sob concorrência, e é o tipo de coisa que não se
 * descobre em desenvolvimento.
 */
export function createDb(url: string) {
  return drizzle(postgres(url, { prepare: false }), { schema })
}

export type Db = ReturnType<typeof createDb>
