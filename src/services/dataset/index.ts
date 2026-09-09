import { makeDatasetService, type DatasetService } from './application/dataset.service'
import { makeBundleSeed } from './infrastructure/bundle-seed.adapter'
import { makeIndexedDbDatasetRepository } from './infrastructure/indexed-db-dataset.adapter'

/**
 * A API pública do contexto do conjunto ingerido (§1, §4).
 *
 * **Armazenamento: IndexedDB** (§7), pelo tamanho: `transactions` tem 4,0 MB medidos, e a cota
 * de `localStorage` é de ~5 MB em UTF-16. A semente do bundle é a outra ponta, e é ela que
 * garante que o app abre mesmo sem banco nenhum.
 */
export function createDatasetService(): DatasetService {
  return makeDatasetService({ repository: makeIndexedDbDatasetRepository(), seed: makeBundleSeed() })
}

export { DATASET_PARTS, makeDatasetService, type DatasetOrigin, type DatasetService, type DatasetServiceDeps } from './application/dataset.service'
export { IncompleteDatasetError } from './domain/errors'
export type { DatasetRepository, DatasetSeed } from './domain/ports/dataset-repository'
export { makeBundleSeed } from './infrastructure/bundle-seed.adapter'
export { makeIndexedDbDatasetRepository } from './infrastructure/indexed-db-dataset.adapter'
