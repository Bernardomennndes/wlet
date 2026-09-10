import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * A pessoa dona dos dados.
 *
 * TODA outra tabela referencia esta, e o `userId` é o eixo do isolamento: este app guarda
 * extrato bancário, e uma consulta que esqueça o filtro devolve a vida financeira de outra
 * pessoa. Por isso a coluna é `notNull` em todo lugar e as chaves compostas começam por ela —
 * um índice que não comece pelo tenant convida a varredura global.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
