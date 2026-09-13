import { index, jsonb, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { users } from './auth'

/**
 * As declarações que se editam ITEM A ITEM ganham tabela.
 *
 * O critério é a tela: lançamento previsto, cobrança, meta e plano têm lista com editar e
 * excluir por linha, então cada um é uma entidade com id próprio e uma escrita que não precisa
 * carregar as outras. O que se edita em BLOCO — teto, perfis de conta, regras — fica em
 * `settings`, logo abaixo.
 */
export const plannedEntries = pgTable(
  'planned_entries',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    categoryId: text('category_id').notNull(),
    entity: text('entity').notNull(),
    recurrence: text('recurrence').notNull(),
    startMonth: text('start_month').notNull(),
    endMonth: text('end_month'),
    count: numeric('count'),
    /** `{kind:'day',day}` ou `{kind:'business-day',nth}` — duas formas, uma coluna. */
    dueOn: jsonb('due_on'),
    /** Mês → valor que substitui o padrão. Esparso por natureza; tabela seria overhead. */
    exceptions: jsonb('exceptions'),
    /** COM `match` a regra é uma conta a pagar; sem, é só projeção. É ele que separa as duas. */
    match: jsonb('match'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

export const receivables = pgTable(
  'receivables',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label').notNull(),
    debtor: text('debtor').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    /**
     * NÃO há `entity` nem `account_id` aqui, e a ausência é a decisão.
     *
     * As duas colunas existiram, copiadas do schema de `plannedEntries`, e não correspondiam a nada
     * que o domínio carregue: o lado de uma cobrança (PF ou PJ) é DERIVADO da conta que a quita —
     * `receivablesInScope` lê `match.accountId` —, e sem conta declarada ela vale nos dois. Um campo
     * gravado seria uma segunda verdade sobre a mesma pergunta, livre para discordar da conta.
     *
     * Enquanto `entity` era `notNull`, o `PUT /config` era IMPOSSÍVEL para quem tivesse cobrança
     * declarada: o cliente não tem esse campo para mandar, e a validação de entrada recusava o corpo
     * inteiro com 400. A migration `0001` a tornou anulável para destravar; a `0002` derrubou as
     * duas, com a tabela vazia (conferido: 0 linhas).
     */
    recurrence: text('recurrence').notNull(),
    startMonth: text('start_month').notNull(),
    endMonth: text('end_month'),
    count: numeric('count'),
    dueOn: jsonb('due_on').notNull(),
    match: jsonb('match').notNull(),
    /** A categoria de despesa que o recebimento ABATE — reembolso não é receita. */
    offsetsCategoryId: text('offsets_category_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

export const goals = pgTable(
  'goals',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label').notNull(),
    target: numeric('target', { precision: 14, scale: 2 }).notNull(),
    saved: numeric('saved', { precision: 14, scale: 2 }).notNull(),
    slot: numeric('slot').notNull(),
    /** O mês em que se quer chegar lá. */
    targetMonth: text('target_month').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

export const planGroups = pgTable(
  'plan_groups',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
)

export const plans = pgTable(
  'plans',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label').notNull(),
    categoryId: text('category_id').notNull(),
    /** Os DOIS preços ficam gravados mesmo com um escolhido: apagar o outro joga fora a pesquisa. */
    cash: numeric('cash', { precision: 14, scale: 2 }).notNull(),
    financedTotal: numeric('financed_total', { precision: 14, scale: 2 }),
    financedInstallments: numeric('financed_installments'),
    /** Nulo = ainda não decidiu. Diferente de "à vista", que seria afirmar por quem não escolheu. */
    payment: text('payment'),
    month: text('month'),
    groupId: text('group_id'),
    status: text('status').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index('plans_user_group_idx').on(t.userId, t.groupId)],
)

/**
 * Os ajustes manuais de categoria.
 *
 * A chave é o id determinístico da transação, e não uma FK: um ajuste pode sobreviver a uma
 * reingestão que ainda não aconteceu, e amarrá-lo por chave estrangeira o apagaria em cascata
 * no meio do processo — justamente o que o id determinístico existe para evitar.
 */
export const overrides = pgTable(
  'overrides',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: text('transaction_id').notNull(),
    categoryId: text('category_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.transactionId] })],
)

/**
 * O que se edita em BLOCO, num registro por pessoa.
 *
 * `rules` e `selfNamePatterns` carregam `RegExp`, e é por isso que eles nunca couberam em
 * `localStorage`: `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum. Aqui viajam e ficam como
 * `{source, flags}`, remontados na leitura — a mesma forma que o contrato declara em `regexWire`.
 */
export const settings = pgTable('settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  budget: jsonb('budget').notNull(),
  accountProfiles: jsonb('account_profiles').notNull(),
  rules: jsonb('rules').notNull(),
  selfNamePatterns: jsonb('self_name_patterns').notNull(),
  /** Recorte, período e tema. Cada um aceita nulo: nulo é "nunca escolheu". */
  preferences: jsonb('preferences').notNull(),
})
