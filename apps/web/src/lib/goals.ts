import { declarations } from './dataset'
import type { Goal } from '@wlet/domain'

export type { Goal } from '@wlet/domain'

/**
 * Metas, geradas pelo `pnpm ingest` a partir de `scripts/goals.config.ts`. É configuração
 * versionada, como as contas e as regras de previsão — editar na interface fica para depois.
 */
export const GOALS: Goal[] = declarations().goals

/** Fração já guardada, limitada a 1: passar da meta não faz a barra estourar. */
export function goalProgress(goal: Goal): number {
  if (!(goal.target > 0)) return 0
  return Math.min(goal.saved / goal.target, 1)
}
