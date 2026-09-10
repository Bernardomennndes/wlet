import { Check, Warning, type Icon as PhosphorIcon } from '@phosphor-icons/react'
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

/**
 * Como cada situação do teto se apresenta — a lista ÚNICA, ao lado do tipo que ela descreve.
 *
 * É a §1 da `enum-display`: as três faces de um valor (o que o código compara, o que a pessoa
 * lê e o que ela vê) moram juntas, no arquivo que declara o enum. Enquanto elas estavam
 * espalhadas, duas telas decidiam a aparência do mesmo `BudgetState` em arquivos diferentes —
 * o cartão de orçamento da Visão geral e a lista de Rubricas —, e nada ligava as duas: mudar a
 * cor de "warning" numa não movia a outra. Foi assim que `--status-warning-text` sobreviveu na
 * lista de Rubricas apontando para um token que NUNCA EXISTIU em `src/index.css`, deixando a
 * porcentagem de uma rubrica perto do limite SEM COR — indistinguível de uma dentro dele.
 *
 * `text` é vazio no estado bom de propósito: ali a cor não comunica nada que o número já não
 * diga, e pintar o normal gastaria o realce que os outros dois estados precisam.
 */
export const BUDGET_STATE: Record<BudgetState, { message: string; Icon: PhosphorIcon; bar: string; banner: string; text: string }> = {
  ok: {
    message: 'Dentro do limite do mês',
    Icon: Check,
    bar: 'var(--series-expense)',
    banner: 'border-border text-muted-foreground',
    text: '',
  },
  warning: {
    message: 'Perto do limite do mês',
    Icon: Warning,
    bar: 'var(--status-warning)',
    banner: 'border-[var(--status-warning)]/40 text-[var(--status-warning)]',
    text: 'text-[var(--status-warning)]',
  },
  over: {
    message: 'O limite do mês foi ultrapassado',
    Icon: Warning,
    bar: 'var(--status-critical)',
    banner: 'border-[var(--status-critical)]/40 text-[var(--status-critical)]',
    text: 'text-[var(--status-critical)]',
  },
}
