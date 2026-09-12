import { z } from 'zod'
import { entity, isoDate, month } from '../../shared/shape'

/**
 * A origem NÃO publica schema nomeado — e é por isso que os nomes daqui são nossos.
 *
 * Quem serve estas rotas é o `apps/api` desta mesma árvore, com `@orpc/server` sobre Hono. Não
 * há classe de servidor a espelhar (nem Pydantic, nem nada): o que existe do outro lado são
 * handlers que montam objeto a partir do Drizzle. Quem vier procurar `AccountResponse` numa
 * origem não vai achar — não porque o nome esteja errado, mas porque não há uma.
 *
 * A junção que substitui a do nome é a do COMPILADOR: `apps/api/src/main.ts` monta o router com
 * `os.router(...)`, que é `implement(wletContract)`, então um campo que mude aqui quebra o
 * handler em compilação — antes de qualquer requisição.
 */

export const account = z.object({
  id: z.string(),
  name: z.string(),
  bank: z.string(),
  bankCode: z.string(),
  type: z.enum(['checking', 'credit-card', 'investment']),
  entity,
  holder: z.string(),
  /** O ACCTID do OFX — é por ele que um arquivo é reconhecido como desta conta. */
  externalId: z.string(),
  coverage: z.object({ from: isoDate, to: isoDate }).nullable(),
  reportedBalance: z.object({ amount: z.number(), asOf: isoDate }).nullable(),
  sources: z.array(z.string()),
  transactionCount: z.number().int(),
})

export const transaction = z.object({
  id: z.string(),
  accountId: z.string(),
  entity,
  /** A data de COMPETÊNCIA: numa compra parcelada, o mês em que a parcela cai. */
  date: isoDate,
  /** A data em que o banco lançou. As duas divergem em cartão, e as duas importam. */
  postedDate: isoDate,
  amount: z.number(),
  description: z.string(),
  rawDescription: z.string(),
  merchant: z.string(),
  kind: z.enum(['statement', 'invoice']),
  categoryId: z.string(),
  categoryRule: z.string().nullable(),
  installment: z.object({ current: z.number().int(), total: z.number().int() }).nullable(),
  invoice: z.object({ dueDate: isoDate, month }).nullable(),
  transferId: z.string().nullable(),
  transferKind: z.enum(['internal', 'card-payment', 'investment', 'unmatched-self']).nullable(),
  counterpartAccountId: z.string().nullable(),
  receivableId: z.string().nullable(),
  plannedId: z.string().nullable(),
  source: z.string(),
  fitId: z.string().nullable(),
})

export const transfer = z.object({
  id: z.string(),
  kind: z.enum(['internal', 'card-payment', 'investment']),
  date: isoDate,
  amount: z.number(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  fromTransactionId: z.string().nullable(),
  toTransactionId: z.string().nullable(),
  description: z.string(),
})

export const datasetMeta = z.object({
  generatedAt: z.string(),
  sourceFiles: z.array(z.object({ path: z.string(), account: z.string(), transactions: z.number().int(), skippedAsDuplicate: z.boolean() })),
  totals: z.object({ transactions: z.number().int(), transfers: z.number().int(), accounts: z.number().int() }),
  months: z.array(month),
})

/** Uma posição da carteira na data do relatório da B3. */
const investmentHolding = z.object({
  code: z.string(),
  /**
   * `z.string()` e não `z.enum`: a classe do ativo é cadastro da corretora, e na SAÍDA um valor
   * novo derrubaria a resposta inteira — a tela de Patrimônio morreria por causa de um papel.
   */
  kind: z.string(),
  label: z.string(),
  quantity: z.number(),
  value: z.number(),
})

/** A posição na data do relatório — `asOf` é quando você exportou, não "hoje". */
const investmentSnapshot = z.object({
  asOf: isoDate,
  source: z.string(),
  holdings: z.array(investmentHolding),
  /** Só os papéis. O patrimônio é este mais o `cash`. */
  total: z.number(),
  cash: z.number(),
  /** Ações entram na série a CUSTO: preço histórico exigiria uma fonte com cadastro. */
  equityAtCost: z.boolean(),
})

/** Um mês da evolução patrimonial. `contributed` é o aporte líquido acumulado. */
const patrimonyPoint = z.object({
  month,
  contributed: z.number(),
  fixedIncome: z.number(),
  equity: z.number(),
  cash: z.number(),
  total: z.number(),
  /** O que os MESMOS aportes valeriam a 100% do CDI — a régua, e não um índice de ações. */
  benchmark: z.number(),
})

/** Os proventos de um mês, separados pelas três naturezas: elas têm tributação diferente. */
const incomeMonth = z.object({ month, dividends: z.number(), jcp: z.number(), yields: z.number(), total: z.number() })

/**
 * A carteira reconstruída.
 *
 * Os três campos eram `z.unknown()`, e `z.unknown()` não declara campo nenhum: o
 * `ResponseValidationPlugin` conferia que `series` era um array e nada sobre o que havia dentro
 * dele — para justamente a tela que lê a série INTEIRA. A forma existe e é nomeada em
 * `@wlet/domain` (`InvestmentSnapshot`, `PatrimonyPoint`, `IncomeMonth`); o contrato espelha
 * essa, campo a campo.
 */
export const investments = z.object({
  snapshot: investmentSnapshot.nullable(),
  series: z.array(patrimonyPoint),
  income: z.array(incomeMonth),
})

/**
 * O conjunto MEDIDO — as cinco partes, e não nove.
 *
 * As declarações saíram daqui quando o app deixou de lê-las do conjunto: elas voltavam do
 * pipeline e criavam DUAS cópias do mesmo dado, e editar a configuração não mudava tela nenhuma
 * até reingerir. Aqui a separação se mantém: quem quer declaração chama `/config`.
 */
export const dataset = z.object({
  accounts: z.array(account),
  meta: datasetMeta,
  transactions: z.array(transaction),
  transfers: z.array(transfer),
  investments,
})

/** O relatório do ingest: é ele que diz o que o pipeline recusou e por quê. */
export const ingestReport = z.object({
  filesRead: z.number().int(),
  skipped: z.array(z.string()),
  duplicated: z.array(z.object({ accountId: z.string(), count: z.number().int() })),
  unknownAccounts: z.array(z.string()),
  pdfProblems: z.array(z.string()),
  /**
   * Os dois carregam a TRANSAÇÃO inteira, e não quatro campos dela.
   *
   * O pipeline os tipa como `Transaction[]` (`@wlet/ingest`, `IngestReport`) e o handler devolve
   * `resultado.report` cru: enquanto o contrato declarava só `date`/`accountId`/`amount`/
   * `description`, a validação de saída podava os outros dezoito campos em silêncio — e quem
   * quisesse abrir a transferência sem contraparte não tinha nem o `id` dela.
   */
  unmatchedTransfers: z.array(transaction),
  uncategorized: z.array(transaction),
  plannedProblems: z.array(z.string()),
  receivableProblems: z.array(z.string()),
  goalProblems: z.array(z.string()),
  brokerageProblems: z.array(z.string()),
  investmentProblems: z.array(z.string()),
})

/**
 * A chave de um arquivo-fonte é o CAMINHO com que ele subiu.
 *
 * Não é uuid nem id gerado: a chave primária de `source_files` é `(user_id, path)`, e é por ela
 * que a reingestão reencontra o arquivo. Declarar `z.string()` cru aceitaria `''`, que é uma
 * chave que o banco grava e ninguém consegue endereçar depois — daí o `min(1)`, que é a forma
 * exata do que o servidor emite.
 */
export const sourcePath = z.string().min(1)

/** Um arquivo-fonte subindo. Base64 porque JSON não tem tipo binário — custa +33% e não há alternativa. */
export const sourceFileUpload = z.object({ path: sourcePath, contentBase64: z.string() })

/** O que a listagem devolve: o metadado de cada arquivo guardado, sem o conteúdo — ver `dataset.sourceContent`. */
export const storedSource = z.object({ path: sourcePath, bytes: z.number().int(), uploadedAt: z.string() })

/**
 * O conteúdo de UM arquivo guardado — o mesmo par `path`/`contentBase64` do upload, no sentido
 * inverso. É o MESMO schema de propósito: subir e baixar o mesmo arquivo por formas diferentes
 * deixaria as duas divergirem no primeiro campo que alguém acrescentasse.
 */
export const storedSourceContent = sourceFileUpload

export type DatasetResponse = z.infer<typeof dataset>
export type IngestReportResponse = z.infer<typeof ingestReport>
