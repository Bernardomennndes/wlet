import { CATEGORY_MAP } from '@wlet/domain'
import { makeOverridesService, type OverridesService } from './application/overrides.service'
import { makeLocalStorageOverrideRepository } from './infrastructure/local-storage-override.adapter'

/**
 * A API pública do contexto de ajustes manuais de categoria (§1, §4).
 *
 * **Armazenamento: `localStorage`** (§7) — pares id→categoria, ordem de KB, por navegador.
 */
export function createOverridesService(): OverridesService {
  return makeOverridesService({
    repository: makeLocalStorageOverrideRepository(),
    categoryExists: (id) => id in CATEGORY_MAP,
  })
}

export { makeOverridesService, type OverridesService, type OverridesServiceDeps } from './application/overrides.service'
export { UnknownCategoryError } from './domain/errors'
export type { OverrideRepository } from './domain/ports/override-repository'
export { makeLocalStorageOverrideRepository } from './infrastructure/local-storage-override.adapter'
export { makeOrpcOverrideRepository } from './infrastructure/orpc-override.adapter'
