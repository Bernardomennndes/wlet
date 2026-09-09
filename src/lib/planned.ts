import { dataset } from './dataset'
import { shiftMonth } from './finance'
import { dueDateOf, occursIn, settleAll, type Settlement } from './settlement'
import type { PlannedEntry } from '@/data/types'

export type { PlannedDueDate, PlannedEntry, Recurrence } from '@/data/types'

// Não há cópia destas três aqui. `PlannedEntry` satisfaz `SettlementRule` por forma, então a
// regra de "incide neste mês", "qual o valor" e "que dia vence" é a MESMA da conciliação.
// Enquanto havia duas, elas já divergiam: a daqui ignorava `endMonth` numa regra parcelada.
export { amountAt, dueDateOf, occursIn } from './settlement'

/**
 * Regras de previsão, geradas pelo `pnpm ingest` a partir de `scripts/planned.config.ts`.
 * É configuração versionada, como as contas e as regras de categoria — editar na
 * interface fica para depois.
 */
export const PLANNED: PlannedEntry[] = dataset().planned

/**
 * Último mês em que a regra ainda incide, quando ela tem fim.
 *
 * Não vem de `settlement`: lá a pergunta é sempre "dentro de qual janela conciliar", e a
 * janela é limitada pelo último mês com dado. Aqui a resposta pode estar no FUTURO — é o que
 * a tela de Previsão usa para saber até onde desenhar.
 */
export function lastOccurrence(entry: PlannedEntry): string | null {
  if (entry.recurrence === 'once') return entry.startMonth
  if (entry.recurrence === 'installments') return shiftMonth(entry.startMonth, Math.max(1, entry.count ?? 1) - 1)
  return entry.endMonth ?? null
}

/**
 * A regra incide neste mês E a ocorrência ainda não chegou na data `after`.
 *
 * É o que autoriza o mês em curso a receber previsão. Sem dia declarado a resposta é não:
 * num mês que já tem extrato, uma regra "todo mês entra tal valor" contaria de novo o que
 * já aconteceu, e é exatamente essa dúvida que o dia resolve.
 */
export function pendingIn(entry: PlannedEntry, month: string, after: string): boolean {
  if (!occursIn(entry, month)) return false
  const due = dueDateOf(entry, month)
  return due !== null && due > after
}

/** Regras que valem no recorte pedido. */
export function plannedInScope(scope: 'all' | 'PF' | 'PJ'): PlannedEntry[] {
  return scope === 'all' ? PLANNED : PLANNED.filter((e) => e.entity === scope)
}

/** Regras que declaram credor conhecido: são elas que viram conta a pagar (ou recebimento). */
export const CONCILIATED: PlannedEntry[] = PLANNED.filter((entry) => entry.match !== undefined)

/**
 * As ocorrências de cada regra conciliada, por mês.
 *
 * Só as regras COM `match` entram. Uma rubrica de gasto não tem credor único, e perguntar se
 * ela foi paga não faz sentido — esse tipo de gasto vive em `budget.config.ts` e é medido
 * contra o teto, não contra um vencimento.
 */
export function settlePlanned(
  transactions: { id: string; amount: number; date: string; month: string; merchant: string; plannedId: string | null }[],
  months: string[],
  today: string,
  kind?: 'income' | 'expense',
): Settlement[] {
  const rules = kind ? CONCILIATED.filter((entry) => entry.kind === kind) : CONCILIATED
  const lastMonth = months.length ? months[months.length - 1] : today.slice(0, 7)
  // Valor absoluto: a conciliação não conhece sinal, e quem chama já escolheu o lado por `kind`.
  const settleable = transactions.map((tx) => ({ ...tx, amount: Math.abs(tx.amount), ruleId: tx.plannedId }))
  return settleAll(rules, settleable, lastMonth, today)
}
