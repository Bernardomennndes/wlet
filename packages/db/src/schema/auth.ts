import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './user'

/**
 * A sessão: um token OPACO, guardado, com prazo.
 *
 * Opaco e não JWT de propósito. Um JWT não se revoga sem uma lista de bloqueio — que é uma
 * consulta ao banco a cada requisição, exatamente o que ele prometia evitar. Aqui o token não
 * carrega nada: ele é uma chave de linha, e apagar a linha encerra a sessão na hora. Para um app
 * que guarda extrato bancário, poder encerrar sessão imediatamente vale mais que economizar uma
 * consulta.
 *
 * O token é gerado com `crypto.randomUUID()` e nunca derivado do usuário: derivado, ele seria
 * adivinhável a partir de um id que aparece em qualquer resposta.
 */
export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Prazo é obrigatório: sessão sem validade é credencial permanente por acidente. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)
