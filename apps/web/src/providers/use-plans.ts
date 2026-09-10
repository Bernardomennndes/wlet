import { createContext, useContext } from 'react'
import type { Plan, PlanGroup } from '@/data/types'
import type { PlansData } from '@/lib/plans'

export interface PlansValue {
  groups: PlanGroup[]
  items: Plan[]
  /**
   * Só os decididos, já derivados. Quem monta a previsão REAL lê daqui — a simulação passa
   * `items` inteiro e escolhe o que ligar.
   */
  decided: Plan[]
  addPlan: (plan: Omit<Plan, 'id'>) => void
  updatePlan: (id: string, patch: Partial<Omit<Plan, 'id'>>) => void
  removePlan: (id: string) => void
  addGroup: (group: Omit<PlanGroup, 'id'>) => void
  removeGroup: (id: string) => void
  /** O envelope inteiro, para exportar. */
  data: PlansData
  /** Substitui tudo — o caminho da importação. Já validado por `parsePlans`. */
  replaceAll: (data: PlansData) => void
}

export const PlansContext = createContext<PlansValue | null>(null)

export function usePlans(): PlansValue {
  const ctx = useContext(PlansContext)
  if (!ctx) throw new Error('usePlans precisa estar dentro de PlansProvider')
  return ctx
}
