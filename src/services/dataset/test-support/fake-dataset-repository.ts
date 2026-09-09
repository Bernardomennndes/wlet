import type { Dataset } from '@/lib/dataset'
import type { DatasetRepository, DatasetSeed } from '../domain/ports/dataset-repository'

/** Fakes in-memory (§9). NÃO é código de produção. */
export function makeFakeDatasetRepository(initial: Dataset | null = null): DatasetRepository & { snapshot(): Dataset | null; cleared: boolean } {
  let data = initial
  const state = {
    cleared: false,
    async find() {
      return data
    },
    async save(next: Dataset) {
      data = next
    },
    async clear() {
      data = null
      state.cleared = true
    },
    snapshot: () => data,
  }
  return state
}

/** Um repositório que SEMPRE explode — o banco corrompido ou bloqueado. */
export function makeBrokenDatasetRepository(): DatasetRepository {
  const boom = () => Promise.reject(new Error('IndexedDB indisponível'))
  return { find: boom, save: boom, clear: boom }
}

export function makeFakeSeed(data: Dataset): DatasetSeed {
  return { read: async () => data }
}

/** Um dataset mínimo e COMPLETO, para o teste partir de algo que passa na conferência. */
export function seedDataset(): Dataset {
  return {
    accounts: [],
    meta: { months: ['2026-01'], generatedAt: '2026-01-01T00:00:00.000Z', sourceFiles: [] } as unknown as Dataset['meta'],
    transactions: [],
    transfers: [],
    planned: [],
    receivables: [],
    budget: { monthlyLimit: 1000, warnAt: 0.75, byCategory: [] },
    goals: [],
    investments: { snapshot: null, series: [], income: [] },
  }
}
