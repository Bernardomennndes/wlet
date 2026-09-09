import type { Dataset } from '@/lib/dataset'
import { IncompleteDatasetError } from '../domain/errors'
import type { DatasetRepository, DatasetSeed } from '../domain/ports/dataset-repository'

/**
 * Os casos de uso do conjunto ingerido.
 *
 * O serviço não CALCULA nada sobre os dados (§5): recorte, agregação mensal, previsão e
 * conciliação vivem em `src/lib/` e são lidos por 25 arquivos. Aqui só mora de onde o conjunto
 * vem, para onde ele vai, e a garantia de que ele está inteiro antes de ser publicado.
 */
export const DATASET_PARTS = ['accounts', 'meta', 'transactions', 'transfers', 'planned', 'receivables', 'budget', 'goals', 'investments'] as const

export type DatasetOrigin = 'indexeddb' | 'seed'

export interface DatasetServiceDeps {
  repository: DatasetRepository
  seed: DatasetSeed
}

export interface DatasetService {
  /** O conjunto para o boot, e de qual origem ele veio. Nunca falha: a semente é o piso. */
  load(): Promise<{ data: Dataset; origin: DatasetOrigin }>
  /** Substitui o conjunto — é o que uma ingestão no navegador produz. */
  replace(data: Dataset): Promise<Dataset>
  /** Descarta o gravado e volta à cópia que veio no aplicativo. */
  reset(): Promise<Dataset>
}

/**
 * Um conjunto meio gravado é indistinguível de um íntegro para quem só confere se as chaves
 * existem, então a integridade é conferida pelo CONTEÚDO antes de publicar.
 */
function assertComplete(data: Dataset): void {
  const missing = DATASET_PARTS.filter((part) => data[part] === undefined || data[part] === null)
  if (missing.length) throw new IncompleteDatasetError(missing)
}

export function makeDatasetService({ repository, seed }: DatasetServiceDeps): DatasetService {
  return {
    async load() {
      // Banco inacessível, corrompido ou lento não pode impedir o app de abrir — a semente
      // responde, e ela é um app inteiro funcionando. Quem chamou recebe a origem e decide o
      // que dizer na tela.
      try {
        const saved = await repository.find()
        if (saved) {
          assertComplete(saved)
          return { data: saved, origin: 'indexeddb' as const }
        }
      } catch {
        // cai na semente
      }
      return { data: await seed.read(), origin: 'seed' as const }
    },

    async replace(data) {
      assertComplete(data)
      await repository.save(data)
      return data
    },

    async reset() {
      const fresh = await seed.read()
      await repository.clear()
      return fresh
    },
  }
}
