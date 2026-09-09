import type { Dataset } from '@/lib/dataset'

/** De onde o conjunto ingerido é lido e onde ele é gravado. */
export interface DatasetRepository {
  find(): Promise<Dataset | null>
  save(data: Dataset): Promise<void>
  clear(): Promise<void>
}

/**
 * A cópia que veio no aplicativo.
 *
 * Nunca é `null`: um app sem dataset nenhum não abre, e a semente é a garantia de que ele
 * sempre abre — mesmo num navegador sem IndexedDB, mesmo num primeiro acesso.
 */
export interface DatasetSeed {
  read(): Promise<Dataset>
}
