import type { Budget } from '../src/data/types.ts'

/**
 * MODELO — copie para `budget.config.ts` (ignorado pelo git). `pnpm setup` faz isso.
 *
 * Teto de gastos do mês. Vale para o mês corrente no recorte selecionado, e é comparado com
 * as saídas medidas — transferência entre contas próprias não conta, porque não é gasto.
 */
export const BUDGET: Budget = {
  monthlyLimit: 5000,
  /** A partir desta fração do teto o cartão avisa; acima de 100% ele alerta. */
  warnAt: 0.75,
}
