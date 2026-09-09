import { emptyPlans, parsePlans, PLANS_KEY, PLANS_VERSION, planId, type PlansData } from '@/lib/plans'
import type { EnvelopeSpec } from '@/services/shared/envelope'
import { browserStorage, makeLocalStorageDriver, type StorageLike, volatileStorage } from '@/services/shared/infrastructure/local-storage.driver'
import type { IdGenerator, PlanRepository } from '../domain/ports/plan-repository'

/**
 * O catálogo de planos em `localStorage`.
 *
 * **Por que `localStorage` e não IndexedDB** (§7): o catálogo é pequeno — dezenas de planos,
 * ordem de KB —, cabe num envelope só e é rascunho por navegador. O critério da §7 é medido, e
 * aqui ele não chega perto de nenhum limite. O dataset de 4,0 MB é que não cabe, e por isso ele
 * é outro contexto, com outro adapter.
 *
 * A `spec` reusa `parsePlans` e `emptyPlans` do kernel (§5) em vez de revalidar aqui: aquele
 * parser já descarta item inválido em silêncio, já converte a versão 1 na 2 e já é exercitado
 * pelos testes. Uma segunda validação divergiria dele no primeiro campo novo.
 *
 * `selfVersioned` porque os planos são gravados como `{ version, groups, items }` desde antes
 * desta camada existir — há navegadores com esse conteúdo agora, e trocar a forma abriria o
 * catálogo vazio sem nenhum erro.
 */
const spec: EnvelopeSpec<PlansData> = {
  version: PLANS_VERSION,
  empty: emptyPlans,
  selfVersioned: true,
  parse: (raw) => parsePlans(raw),
  // `parsePlans` já sabe converter a versão 1, então a migração é ele mesmo — declarar um ramo
  // próprio aqui seria a segunda implementação da mesma conversão (§10).
  migrate: (raw) => parsePlans(raw),
}

export function makeLocalStoragePlanRepository(storage: StorageLike = browserStorage() ?? volatileStorage()): PlanRepository {
  const driver = makeLocalStorageDriver(storage, PLANS_KEY, spec)
  return {
    findAll: () => driver.read(),
    save: (data) => driver.write(data),
  }
}

/** O gerador real: `Date.now()` + `Math.random()`, como o kernel já fazia. */
export function makeIdGenerator(): IdGenerator {
  return { next: (prefix) => planId(prefix) }
}
