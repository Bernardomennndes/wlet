import { z } from 'zod'
import { entity, isoDate, month } from '../../shared/shape'

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

export const investments = z.object({
  snapshot: z.unknown().nullable(),
  series: z.array(z.unknown()),
  income: z.array(z.unknown()),
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
  unmatchedTransfers: z.array(z.object({ date: isoDate, accountId: z.string(), amount: z.number(), description: z.string() })),
  uncategorized: z.array(z.object({ date: isoDate, accountId: z.string(), amount: z.number(), description: z.string() })),
  plannedProblems: z.array(z.string()),
  receivableProblems: z.array(z.string()),
  goalProblems: z.array(z.string()),
  brokerageProblems: z.array(z.string()),
  investmentProblems: z.array(z.string()),
})

/** Um arquivo-fonte subindo. Base64 porque JSON não tem tipo binário — custa +33% e não há alternativa. */
export const sourceFileUpload = z.object({ path: z.string(), contentBase64: z.string() })

export const storedSource = z.object({ path: z.string(), bytes: z.number().int(), uploadedAt: z.string() })

export type DatasetResponse = z.infer<typeof dataset>
export type IngestReportResponse = z.infer<typeof ingestReport>
