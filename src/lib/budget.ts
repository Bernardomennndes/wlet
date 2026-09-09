import { declarations } from './dataset'
import type { Budget } from '@/data/types'

export type { Budget } from '@/data/types'

/**
 * Teto de gastos, gerado pelo `pnpm ingest` a partir de `scripts/budget.config.ts`. É
 * configuração versionada, como as metas — editar na interface fica para depois.
 */
export const BUDGET: Budget = declarations().budget

export type BudgetState = 'ok' | 'warning' | 'over'

/** Como o mês está em relação ao teto. É leitura do número, não decoração. */
export function budgetState(spent: number, budget: Budget = BUDGET): BudgetState {
  if (!(budget.monthlyLimit > 0)) return 'ok'
  const share = spent / budget.monthlyLimit
  if (share >= 1) return 'over'
  return share >= budget.warnAt ? 'warning' : 'ok'
}
