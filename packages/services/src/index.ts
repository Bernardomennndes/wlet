/**
 * A API pública da camada de serviços — as PEÇAS, não a montagem.
 *
 * Quem monta é o composition root de cada aplicação, e isso não é preciosismo de camada: o app
 * monta com IndexedDB e a semente que o Vite empacotou; o servidor vai montar com Postgres e
 * sem semente nenhuma. Se a fábrica morasse aqui, ela teria de conhecer os dois — e o pacote
 * passaria a depender do Vite para o servidor compilar.
 */
export { makeOrpcConfigRepository, createConfigService, emptyConfig, InvalidConfigError, makeConfigService, makeIndexedDbConfigRepository } from './config'
export type { ConfigData, ConfigRepository, ConfigSeed, ConfigService } from './config'

export { makeOrpcDatasetRepository, makeOrpcIngestRunner, makeOrpcSourceStore, createDatasetService, DATASET_PARTS, IncompleteDatasetError, makeDatasetService, NoSourcesError } from './dataset'
export type { DatasetOrigin, DatasetRepository, DatasetSeed, DatasetService, DatasetServiceDeps } from './dataset'

export { makeOrpcOverrideRepository, createOverridesService, makeOverridesService } from './overrides'
export type { OverridesService } from './overrides'

export { makeOrpcPlanRepository, createPlansService, makePlansService } from './plans'
export type { PlansService } from './plans'

export { makeOrpcPreferencesRepository, createPreferencesService, makePreferencesService } from './preferences'
export type { PreferencesService } from './preferences'

export { exportState, importState, inspectPackage, PACKAGE_PARTS } from './backup'
export type { BackupPayload, ImportSummary, PackageContents, PackagePart } from './backup'

export type { RemoteDeps } from './shared/infrastructure/orpc'
