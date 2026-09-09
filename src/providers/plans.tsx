import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Plan, PlanGroup } from '@/data/types'
import { decidedPlans, type PlansData } from '@/lib/plans'
import { services } from '@/services'
import { preloaded } from './preloaded'
import { PlansContext, type PlansValue } from './use-plans'

/**
 * O catálogo de planos, no navegador.
 *
 * Toda mutação grava na hora: não existe "salvar" nesta tela, porque não existe nada a
 * confirmar — o dado é local, e um botão de salvar só criaria a chance de perder o que foi
 * digitado.
 *
 * **O provider deixou de saber COMO gravar.** Ele montava o objeto novo e chamava `writePlans`,
 * o que significava manter aqui a regra de que apagar um grupo não apaga os planos dele — regra
 * que também precisava existir em qualquer outro lugar que mexesse no catálogo. Agora ele
 * delega ao serviço, que é quem tem essa regra e o teste dela, e só guarda o resultado no
 * estado do React. O que sobrou aqui é o que é de fato do React: estado e memoização.
 */
export function PlansProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PlansData>(() => preloaded().plans)

  /**
   * A tela não espera a gravação, mas a falha não pode sumir.
   *
   * O serviço devolve o catálogo já alterado, então o estado sai da RESPOSTA e não de uma
   * cópia montada aqui — é isso que impede a tela de divergir do que foi gravado. Numa falha o
   * estado não avança, que é o comportamento certo: mostrar um plano que não foi guardado é
   * pior do que não mostrá-lo.
   */
  const run = useCallback((operation: Promise<unknown>, after: () => Promise<PlansData>) => {
    void operation
      .then(after)
      .then(setData)
      .catch((cause: unknown) => console.error('[wlet] não foi possível guardar o plano:', cause))
  }, [])

  const refresh = useCallback(() => services().plans.list(), [])

  const addPlan = useCallback((plan: Omit<Plan, 'id'>) => run(services().plans.addPlan(plan), refresh), [run, refresh])
  const updatePlan = useCallback((id: string, patch: Partial<Omit<Plan, 'id'>>) => run(services().plans.updatePlan(id, patch), refresh), [run, refresh])
  const removePlan = useCallback((id: string) => run(services().plans.removePlan(id), refresh), [run, refresh])
  const addGroup = useCallback((group: Omit<PlanGroup, 'id'>) => run(services().plans.addGroup(group), refresh), [run, refresh])
  const removeGroup = useCallback((id: string) => run(services().plans.removeGroup(id), refresh), [run, refresh])
  const replaceAll = useCallback((next: PlansData) => run(services().plans.replaceAll(next), refresh), [run, refresh])

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
