import plannedJson from '@/generated/planned.json'
import { shiftMonth } from './finance'
import type { PlannedEntry } from '@/data/types'

export type { PlannedEntry, Recurrence } from '@/data/types'

/**
 * Regras de previsão, geradas pelo `pnpm ingest` a partir de `scripts/planned.config.ts`.
 * É configuração versionada, como as contas e as regras de categoria — editar na
 * interface fica para depois.
 */
export const PLANNED: PlannedEntry[] = plannedJson as PlannedEntry[]

/** Valor da regra naquele mês, já considerando exceção. */
export function amountAt(entry: PlannedEntry, month: string): number {
  return entry.exceptions?.[month] ?? entry.amount
}

/** A regra incide neste mês? */
export function occursIn(entry: PlannedEntry, month: string): boolean {
  if (month < entry.startMonth) return false
  if (entry.recurrence === 'once') return month === entry.startMonth
  if (entry.recurrence === 'monthly') return !entry.endMonth || month <= entry.endMonth
  const total = Math.max(1, entry.count ?? 1)
  return month <= shiftMonth(entry.startMonth, total - 1)
}

/** Último mês em que a regra ainda incide, quando tem fim. */
export function lastOccurrence(entry: PlannedEntry): string | null {
  if (entry.recurrence === 'once') return entry.startMonth
  if (entry.recurrence === 'installments') return shiftMonth(entry.startMonth, Math.max(1, entry.count ?? 1) - 1)
  return entry.endMonth ?? null
}

/** Regras que valem no recorte pedido. */
export function plannedInScope(scope: 'all' | 'PF' | 'PJ'): PlannedEntry[] {
  return scope === 'all' ? PLANNED : PLANNED.filter((e) => e.entity === scope)
}
