import type { Dataset } from '@wlet/domain'
import type { IngestResult } from '@wlet/ingest/pipeline'
import type { SourceFile } from '@wlet/ingest/io'
import type { DatasetRepository, DatasetSeed } from '../domain/ports/dataset-repository'
import type { IngestRunner } from '../domain/ports/ingest-runner'
import type { SourceStore } from '../domain/ports/source-store'

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
  const boom = () => Promise.reject(new Error('servidor indisponível'))
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
    investments: { snapshot: null, series: [], income: [] },
  }
}

/** Um executor que devolve o que lhe mandaram devolver, sem tocar em arquivo nenhum. */
export function makeFakeRunner(result: Partial<IngestResult>): IngestRunner & { calls: number } {
  const state = {
    calls: 0,
    async run() {
      state.calls += 1
      const base = seedDataset()
      return {
        accounts: base.accounts,
        transactions: base.transactions,
        transfers: base.transfers,
        meta: base.meta,
        investments: base.investments,
        report: {
          filesRead: 0,
          skipped: [],
          duplicated: [],
          pdfProblems: [],
          unknownAccounts: [],
          plannedProblems: [],
          receivableProblems: [],
          goalProblems: [],
          brokerageProblems: [],
          investmentProblems: [],
          unmatchedTransfers: [],
          uncategorized: [],
        },
        ...result,
      } as IngestResult
    },
  }
  return state
}

/** Um executor que sempre falha — o arquivo ilegível, o PDF que não fecha. */
export function makeBrokenRunner(): IngestRunner {
  return { run: () => Promise.reject(new Error('arquivo ilegível')) }
}

/** Um armazenamento de fontes em memória, para o teste ver o que foi guardado e quando. */
export function makeFakeSourceStore(initial: SourceFile[] = []): SourceStore & { snapshot(): SourceFile[]; cleared: boolean } {
  let files = [...initial]
  const state = {
    cleared: false,
    async save(next: SourceFile[]) {
      files = [...next]
    },
    async load() {
      return [...files]
    },
    async count() {
      return files.length
    },
    async clear() {
      files = []
      state.cleared = true
    },
    snapshot: () => [...files],
  }
  return state
}
