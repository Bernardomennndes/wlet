import { createContext, useContext } from 'react'
import type { Overrides, Period, Scope, ViewTransaction } from '@/lib/finance'

export interface FiltersValue {
  scope: Scope
  setScope: (scope: Scope) => void
  period: Period
  setPeriod: (period: Period) => void
  months: string[]
  /** Meses que têm lançamentos. O seletor aceita qualquer mês; isto só marca onde há dados. */
  monthsWithData: string[]
  overrides: Overrides
  setOverride: (transactionId: string, categoryId: string | null) => void
  transactions: ViewTransaction[]
  /**
   * Todo o recorte, do primeiro ao último mês com lançamentos, ignorando o período do
   * cabeçalho. Quem precisa de fato consumado — parcela de cartão que ainda vai cair —
   * lê daqui; quem mostra o período lê `transactions`.
   */
  history: ViewTransaction[]
}

export const FiltersContext = createContext<FiltersValue | null>(null)

export function useFilters(): FiltersValue {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters precisa estar dentro de FiltersProvider')
  return ctx
}
