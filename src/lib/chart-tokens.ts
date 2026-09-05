import { CATEGORY_MAP } from '@/data/categories'
import { accountInScope, displayCategoryId, flowOf, TRANSACTIONS, type Scope } from './finance'

/**
 * Cores das séries. Os slots seguem uma ordem fixa validada para daltonismo;
 * cada categoria recebe o mesmo slot em qualquer filtro, então trocar o
 * período nunca "repinta" uma categoria.
 */
export const SERIES_VARS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)']
export const OTHER_VAR = 'var(--series-other)'
export const INCOME_VAR = 'var(--series-income)'
export const EXPENSE_VAR = 'var(--series-expense)'
export const NEUTRAL_VAR = 'var(--series-neutral)'

/**
 * Slot fixo por categoria de despesa, decidido uma vez pelo conjunto inteiro.
 *
 * O ranking soma os três recortes e usa `displayCategoryId`, não `categoryId` cru: as
 * categorias que só existem dentro de um recorte — "Retirada para o sócio" na visão PJ,
 * "Retirada da PJ" na PF — precisam de slot próprio, senão caem no cinza de "Outras" num
 * gráfico e recebem cor emprestada no outro. É por serem decididas aqui, uma vez e fora
 * de qualquer filtro, que trocar o recorte nunca repinta uma série.
 */
const SCOPES: Scope[] = ['all', 'PF', 'PJ']

export const CATEGORY_SLOT: Record<string, number> = (() => {
  const totals = new Map<string, number>()
  for (const tx of TRANSACTIONS) {
    for (const scope of SCOPES) {
      if (!accountInScope(tx.accountId, scope)) continue
      if (flowOf(tx, scope) !== 'expense') continue
      const id = displayCategoryId(tx, scope)
      const cat = CATEGORY_MAP[id]
      if (!cat || cat.kind !== 'expense' || id === 'outros') continue
      totals.set(id, (totals.get(id) ?? 0) + Math.abs(tx.amount))
    }
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const slots: Record<string, number> = {}
  ranked.slice(0, SERIES_VARS.length).forEach((id, i) => {
    slots[id] = i
  })
  return slots
})()

export function categoryColor(categoryId: string): string {
  const slot = CATEGORY_SLOT[categoryId]
  return slot === undefined ? OTHER_VAR : SERIES_VARS[slot]
}
