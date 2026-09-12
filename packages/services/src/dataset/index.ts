/**
 * A API pública do contexto do conjunto ingerido (§1, §4).
 *
 * **Armazenamento: o servidor**, e o pipeline roda LÁ. O par IndexedDB + Web Worker que vivia
 * aqui foi removido com o modo local: ele obrigava cada navegador a reprocessar os mesmos ~15 MB
 * de extrato para chegar ao mesmo conjunto, e o resultado só existia naquele navegador.
 *
 * A semente do bundle é a outra ponta, e continua: um servidor ainda vazio abre com a
 * demonstração em vez de uma tela de zeros que não explica nada.
 */
export { DATASET_PARTS, makeDatasetService, type DatasetOrigin, type DatasetService, type DatasetServiceDeps } from './application/dataset.service'
export { IncompleteDatasetError, NoSourcesError } from './domain/errors'
export type { DatasetRepository, DatasetSeed } from './domain/ports/dataset-repository'
export type { IngestRunner } from './domain/ports/ingest-runner'
export type { SourceStore } from './domain/ports/source-store'
export { makeOrpcDatasetRepository, makeOrpcIngestRunner, makeOrpcSourceStore } from './infrastructure/orpc-dataset.adapter'
