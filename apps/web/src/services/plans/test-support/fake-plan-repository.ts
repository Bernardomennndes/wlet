import { emptyPlans, type PlansData } from '@/lib/plans'
import type { IdGenerator, PlanRepository } from '../domain/ports/plan-repository'

/**
 * Fakes in-memory para exercitar o serviço sem navegador (§9).
 *
 * **Isto NÃO é código de produção.** É a única pasta do contexto que os adapters não podem
 * importar, e a razão de ela existir é que o `application/` merece teste rápido e o IndexedDB
 * não é testável no runner do Node sem dependência nova.
 */
export function makeFakePlanRepository(initial: PlansData = emptyPlans()): PlanRepository & { snapshot(): PlansData; saves: number } {
  let data: PlansData = structuredClone(initial)
  const state = {
    saves: 0,
    // Devolve CÓPIA nos dois sentidos: um fake que entrega a referência viva deixa o teste
    // passar mesmo quando o serviço muta o que leu, que é justamente o bug que se quer pegar.
    async findAll() {
      return structuredClone(data)
    },
    async save(next: PlansData) {
      data = structuredClone(next)
      state.saves += 1
    },
    snapshot: () => structuredClone(data),
  }
  return state
}

/**
 * Ids previsíveis: `plan-1`, `plan-2`, `group-1`…
 *
 * A §9 proíbe `Date.now()` e `Math.random()` no `test-support` — sem isso o teste não consegue
 * afirmar QUAL plano foi gravado, e passaria a testar só a contagem.
 */
export function makeSequentialIds(): IdGenerator {
  const counters = new Map<string, number>()
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      return `${prefix}-${n}`
    },
  }
}
