import { relations } from 'drizzle-orm'
import { date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** O id vem do PERFIL declarado (`inter-pj`, `nubank-cartao`), não é gerado — ver `transactions.id`. */
    id: text('id').notNull(),
    name: text('name').notNull(),
    bank: text('bank').notNull(),
    bankCode: text('bank_code').notNull(),
    entity: text('entity').notNull(),
    type: text('type').notNull(),
    holder: text('holder').notNull(),
    /** O ACCTID do OFX — é por ele que um arquivo é reconhecido como desta conta. */
    externalId: text('external_id').notNull(),
    transactionCount: integer('transaction_count').notNull().default(0),
    coverageFrom: date('coverage_from'),
    coverageTo: date('coverage_to'),
    /** O saldo que o banco declarou no arquivo mais recente, quando existe. */
    reportedBalance: jsonb('reported_balance'),
    sources: jsonb('sources').notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

export const transactions = pgTable(
  'transactions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * O id DETERMINÍSTICO do ingest: `sha1(profile.id|data|valor|descrição|fitId|fatura|ordinal)`
     * cortado em doze. Ele é chave NATURAL de propósito — um `uuid` gerado aqui mudaria a cada
     * reingestão e apagaria todo ajuste manual de categoria em silêncio, porque `overrides` é
     * chaveado por ele.
     */
    id: text('id').notNull(),
    accountId: text('account_id').notNull(),
    entity: text('entity').notNull(),
    /** A data de COMPETÊNCIA: numa parcelada, o mês em que a parcela cai. */
    date: date('date').notNull(),
    /** A data em que o banco lançou. Diverge da competência em cartão, e as duas importam. */
    postedDate: date('posted_date').notNull(),
    /** `numeric` e não `double`: somar dezenas de floats não devolve o número que a tela mostra. */
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    description: text('description').notNull(),
    rawDescription: text('raw_description').notNull(),
    merchant: text('merchant').notNull(),
    kind: text('kind').notNull(),
    categoryId: text('category_id').notNull(),
    /** Qual regra decidiu a categoria — é o que torna a categorização auditável. */
    categoryRule: text('category_rule'),
    installmentCurrent: integer('installment_current'),
    installmentTotal: integer('installment_total'),
    invoice: jsonb('invoice'),
    transferKind: text('transfer_kind'),
    counterpartAccountId: text('counterpart_account_id'),
    transferId: text('transfer_id'),
    plannedId: text('planned_id'),
    receivableId: text('receivable_id'),
    source: text('source').notNull(),
    fitId: text('fit_id'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    // A tela lê por MÊS e por categoria; os dois índices começam pelo tenant.
    index('transactions_user_date_idx').on(t.userId, t.date),
    index('transactions_user_category_idx').on(t.userId, t.categoryId),
  ],
)

export const transfers = pgTable(
  'transfers',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    kind: text('kind').notNull(),
    fromAccountId: text('from_account_id').notNull(),
    toAccountId: text('to_account_id').notNull(),
    /** As pontas: nulas quando a contraparte foi INFERIDA e não casada com um lançamento. */
    fromTransactionId: text('from_transaction_id'),
    toTransactionId: text('to_transaction_id'),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    date: date('date').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

/**
 * O que não se consulta por coluna: os metadados do conjunto e a carteira reconstruída.
 *
 * `investments` é uma série mês a mês derivada de três fontes e lida INTEIRA pela tela de
 * Patrimônio — quebrá-la em tabelas pagaria junção para nunca filtrar. `meta` é um retrato.
 */
export const datasetBlobs = pgTable('dataset_blobs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  meta: jsonb('meta').notNull(),
  investments: jsonb('investments').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Os arquivos originais — extratos e faturas.
 *
 * Guardados porque perfil de conta e regra de categoria agem durante a LEITURA: mudar qualquer
 * uma delas exige passar os arquivos pelo pipeline de novo, e sem eles a pessoa teria de subir
 * tudo outra vez. É o dado mais sensível da base, e o que a abordagem A aceitou pôr no servidor.
 */
export const sourceFiles = pgTable(
  'source_files',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    content: text('content').notNull(),
    bytes: integer('bytes').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.path] })],
)

export const accountsRelations = relations(accounts, ({ one }) => ({ user: one(users, { fields: [accounts.userId], references: [users.id] }) }))
export const transactionsRelations = relations(transactions, ({ one }) => ({ user: one(users, { fields: [transactions.userId], references: [users.id] }) }))
