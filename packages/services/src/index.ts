/**
 * A API pública da camada de serviços — as PEÇAS, não a montagem.
 *
 * Quem monta é o composition root de cada aplicação, e isso não é preciosismo de camada: o app
 * monta os cinco contextos sobre oRPC apontando para a sua instância, e o servidor monta os
 * mesmos casos de uso sobre Postgres, sem semente nenhuma. Se a fábrica morasse aqui, ela teria
 * de conhecer os dois — e o pacote passaria a depender do Vite para o servidor compilar.
 *
 * **Só existe uma infraestrutura de cliente: oRPC.** Os adapters de IndexedDB, `localStorage` e
 * Web Worker foram removidos. O que eles guardavam não saía do navegador, e era isso que os
 * condenava: o mesmo dado tinha duas respostas possíveis conforme onde fosse lido.
 */
export { emptyConfig, InvalidConfigError, makeConfigService, makeOrpcConfigRepository } from './config'
export type { ConfigData, ConfigRepository, ConfigSeed, ConfigService } from './config'

export { DATASET_PARTS, IncompleteDatasetError, makeDatasetService, makeOrpcDatasetRepository, makeOrpcIngestRunner, makeOrpcSourceStore, NoSourcesError } from './dataset'
export type { DatasetOrigin, DatasetRepository, DatasetSeed, DatasetService, DatasetServiceDeps } from './dataset'

export { makeOrpcOverrideRepository, makeOverridesService } from './overrides'
export type { OverridesService } from './overrides'

export { makeOrpcPlanRepository, makePlanIdGenerator, makePlansService } from './plans'
export type { PlansService } from './plans'

export { makeOrpcPreferencesRepository, makePreferencesService } from './preferences'
export type { PreferencesService } from './preferences'

export { exportState, importState, inspectPackage, PACKAGE_PARTS } from './backup'
export type { BackupPayload, ImportSummary, PackageContents, PackagePart } from './backup'

export type { RemoteDeps } from './shared/infrastructure/orpc'
