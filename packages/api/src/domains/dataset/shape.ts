import { z } from 'zod'
import { entity, isoDate, month } from '../../shared/shape'

export const account = z.object({
  id: z.string(),
  label: z.string(),
  entity,
  type: z.enum(['checking', 'card', 'virtual']),
  transactionCount: z.number().int(),
  coverage: z.object({ from: isoDate, to: isoDate }).nullish(),
})

export const transaction = z.object({
  id: z.string(),
  accountId: z.string(),
  date: isoDate,
  amount: z.number(),
  description: z.string(),
  rawDescription: z.string(),
  merchant: z.string(),
  categoryId: z.string(),
  installment: z.object({ current: z.number().int(), total: z.number().int() }).nullish(),
  invoiceMonth: month.nullish(),
  transferKind: z.string().nullish(),
  counterpartAccountId: z.string().nullish(),
  transferId: z.string().nullish(),
  plannedId: z.string().nullish(),
  receivableId: z.string().nullish(),
})

export const transfer = z.object({
  id: z.string(),
  kind: z.string(),
  from: z.string(),
  to: z.string(),
  amount: z.number(),
  date: isoDate,
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
