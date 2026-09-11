import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * As quatro tabelas que o Better Auth exige, com os nomes de coluna que ele espera.
 *
 * **Better Auth é self-hosted, e essa é a razão da escolha.** Um provedor externo veria o
 * cadastro de quem usa um app de extrato bancário — quem, quando, de onde. Aqui a sessão nunca
 * sai da sua infraestrutura, e a promessa de privacidade do produto não passa a depender do
 * contrato de privacidade de um terceiro.
 *
 * O `id` é TEXT e não `uuid` porque quem o gera é a biblioteca, não o Postgres. Tentar impor o
 * tipo aqui só quebraria o adapter, e o ganho seria nenhum.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * A sessão. Continua sendo um token OPACO guardado — agora gerido pela biblioteca.
 *
 * O argumento é o mesmo que valia na versão artesanal: um JWT não se revoga sem lista de
 * bloqueio, que é uma consulta por requisição — exatamente o que ele prometia evitar. Apagar a
 * linha encerra a sessão na hora, e para um app que guarda extrato isso vale mais que poupar
 * uma consulta.
 *
 * `ipAddress` e `userAgent` vêm do Better Auth e ficam: numa conta que guarda a vida financeira
 * inteira, poder olhar de onde uma sessão foi aberta é o mínimo para desconfiar de uma.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

/**
 * A credencial. Guarda a senha (hash scrypt) e, no futuro, o vínculo com um provedor OAuth.
 *
 * Ela é separada de `users` de propósito, e não por gosto da biblioteca: a mesma pessoa pode ter
 * senha E um login social, e uma coluna de senha em `users` obrigaria a escolher um dos dois.
 *
 * **Chama-se `auth_accounts` e não `accounts`** porque neste domínio "conta" já quer dizer conta
 * BANCÁRIA — Inter PJ, Nubank Cartão —, e o termo aparece assim em todo o app. Deixar os dois
 * com o mesmo nome faria `accounts` significar duas coisas conforme o import, que é o tipo de
 * ambiguidade que só se descobre depurando.
 */
export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    idToken: text('id_token'),
    /** Hash scrypt — nunca a senha. */
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('auth_accounts_user_idx').on(t.userId)],
)

/** Os códigos de uso único: verificação de e-mail e redefinição de senha. */
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
