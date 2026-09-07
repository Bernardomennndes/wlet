import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Plan, PlanGroup } from '@/data/types'
import { decidedPlans, planId, readPlans, writePlans, type PlansData } from '@/lib/plans'
import { PlansContext, type PlansValue } from './use-plans'

/**
 * O catálogo de planos, no navegador.
 *
 * Toda mutação grava na hora: não existe "salvar" nesta tela, porque não existe nada a
 * confirmar — o dado é local, e um botão de salvar só criaria a chance de perder o que foi
 * digitado. A gravação passa pelo mesmo objeto que o estado, então o que está na tela e o que
 * está no armazenamento não podem divergir.
 */
export function PlansProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlansData>(() => readPlans())

  const commit = useCallback((next: PlansData) => {
    setData(next)
    writePlans(next)
  }, [])

  const addPlan = useCallback((plan: Omit<Plan, 'id'>) => {
    setData((prev) => {
      const next = { ...prev, items: [...prev.items, { ...plan, id: planId('plan') }] }
      writePlans(next)
      return next
    })
  }, [])

  const updatePlan = useCallback((id: string, patch: Partial<Omit<Plan, 'id'>>) => {
    setData((prev) => {
      const next = { ...prev, items: prev.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
      writePlans(next)
      return next
    })
  }, [])

  const removePlan = useCallback((id: string) => {
    setData((prev) => {
      const next = { ...prev, items: prev.items.filter((p) => p.id !== id) }
      writePlans(next)
      return next
    })
  }, [])

  const addGroup = useCallback((group: Omit<PlanGroup, 'id'>) => {
    setData((prev) => {
      const next = { ...prev, groups: [...prev.groups, { ...group, id: planId('group') }] }
      writePlans(next)
      return next
    })
  }, [])

  const removeGroup = useCallback((id: string) => {
    setData((prev) => {
      // Apagar o grupo NÃO apaga os itens: eles voltam a ser avulsos. Sumir com uma viagem
      // inteira porque alguém removeu o rótulo dela seria perda de dado sem aviso.
      const next = { groups: prev.groups.filter((g) => g.id !== id), items: prev.items.map((p) => (p.groupId === id ? { ...p, groupId: undefined } : p)), version: prev.version }
      writePlans(next)
      return next
    })
  }, [])

  const replaceAll = useCallback((next: PlansData) => commit(next), [commit])

  const value = useMemo<PlansValue>(
    () => ({
      groups: data.groups,
      items: data.items,
      decided: decidedPlans(data.items),
      addPlan,
      updatePlan,
      removePlan,
      addGroup,
      removeGroup,
      data,
      replaceAll,
    }),
    [data, addPlan, updatePlan, removePlan, addGroup, removeGroup, replaceAll],
  )

  return <PlansContext.Provider value={value}>{children}</PlansContext.Provider>
}
