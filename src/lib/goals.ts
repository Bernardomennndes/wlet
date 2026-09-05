import goalsJson from '@/generated/goals.json'
import type { Goal } from '@/data/types'

export type { Goal } from '@/data/types'

/**
 * Metas, geradas pelo `pnpm ingest` a partir de `scripts/goals.config.ts`. É configuração
 * versionada, como as contas e as regras de previsão — editar na interface fica para depois.
 */
export const GOALS: Goal[] = goalsJson as Goal[]

/** Fração já guardada, limitada a 1: passar da meta não faz a barra estourar. */
export function goalProgress(goal: Goal): number {
  if (!(goal.target > 0)) return 0
  return Math.min(goal.saved / goal.target, 1)
}
