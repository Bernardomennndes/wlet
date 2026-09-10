import type { Goal } from '@wlet/domain'

/**
 * MODELO — copie para `goals.config.ts` (ignorado pelo git). `pnpm run setup` faz isso.
 *
 * Metas de poupança: quanto se quer juntar, até quando, e quanto já está guardado.
 *
 * `saved` é digitado aqui, e não derivado do saldo da conta investimento, porque uma meta
 * não é o saldo: parte do aplicado pode ser reserva, e o mesmo saldo não deve contar para
 * duas metas. `slot` é a cor da barra, entre `--series-1..8`, declarada por meta e não
 * escolhida pela posição na lista — reordenar as metas não pode repintá-las.
 */
export const GOALS: Goal[] = [
  { id: 'reserva', label: 'Reserva de emergência', saved: 4000, target: 20000, targetMonth: '2027-06', slot: 1 },
  { id: 'viagem', label: 'Viagem', saved: 1200, target: 8000, targetMonth: '2027-03', slot: 5 },
]
