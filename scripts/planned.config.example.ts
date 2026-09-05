import type { PlannedEntry } from '../src/data/types.ts'

/**
 * MODELO — copie para `planned.config.ts` (ignorado pelo git). `pnpm setup` faz isso.
 *
 * Lançamentos previstos: o que se espera receber e pagar nos meses que ainda não têm
 * extrato. É daqui que sai a previsão nos gráficos — nada é extrapolado do histórico.
 *
 * O que NÃO precisa entrar aqui: parcelas de cartão já compradas. O ingest deriva as que
 * ainda vão ser cobradas a partir do próprio lançamento.
 *
 * Campos: `recurrence` é 'monthly' (com `endMonth` opcional), 'installments' (com `count`)
 * ou 'once'; `exceptions` mapeia mês → valor para o mês que foge do padrão.
 */
export const PLANNED_ENTRIES: PlannedEntry[] = [
  {
    id: 'salario',
    kind: 'income',
    label: 'Salário',
    amount: 5000,
    categoryId: 'receita-pj',
    entity: 'PJ',
    recurrence: 'monthly',
    startMonth: '2026-01',
  },
]
