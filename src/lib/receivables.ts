import { dataset } from './dataset'
import { dueDateOf, occursIn, settleAll, type Settlement } from './settlement'
import type { Receivable } from '@/data/types'

export type { Receivable, SettlementStatus } from '@/data/types'
export type { Settlement } from './settlement'
export { dueDateOf, occursIn }
export { receivableStatuses } from '@/data/types'

/**
 * Cobranças, geradas pelo `pnpm ingest` a partir de `scripts/receivables.config.ts`.
 *
 * Este módulo NÃO importa `finance` de propósito: `flowOf` precisa saber qual categoria uma
 * cobrança abate, então é `finance` quem depende daqui. Por isso `settle` recebe os meses e
 * a data de corte por parâmetro, em vez de buscá-los.
 */
export const RECEIVABLES: Receivable[] = dataset().receivables

export const RECEIVABLE_MAP: Record<string, Receivable> = Object.fromEntries(RECEIVABLES.map((r) => [r.id, r]))

/** A categoria de despesa que este recebimento abate, se ele quita alguma cobrança. */
export function offsetCategoryOf(receivableId: string | null): string | null {
  return receivableId ? (RECEIVABLE_MAP[receivableId]?.offsetsCategoryId ?? null) : null
}

/**
 * As ocorrências de cada cobrança, por mês. A conciliação em si mora em `settlement`, que
 * serve igualmente às contas a pagar — a alocação de pagamento adiantado é sutil demais para
 * existir em duas cópias.
 */
export function settle(transactions: { id: string; amount: number; date: string; month: string; merchant: string; receivableId: string | null }[], months: string[], today: string): Settlement[] {
  const lastMonth = months.length ? months[months.length - 1] : today.slice(0, 7)
  const settleable = transactions.filter((tx) => tx.amount > 0).map((tx) => ({ ...tx, ruleId: tx.receivableId }))
  return settleAll(RECEIVABLES, settleable, lastMonth, today)
}

/**
 * Cobranças do recorte. Sem conta declarada não dá para dizer que ela é de um lado só, então
 * ela vale nos dois — a mesma leitura da tela de Cobranças.
 */
export function receivablesInScope(scope: 'all' | 'PF' | 'PJ', accountEntity: (accountId: string) => 'PF' | 'PJ' | undefined): Receivable[] {
  if (scope === 'all') return RECEIVABLES
  return RECEIVABLES.filter((receivable) => !receivable.match.accountId || accountEntity(receivable.match.accountId) === scope)
}
