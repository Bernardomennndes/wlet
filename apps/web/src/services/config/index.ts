import { makeConfigService, type ConfigService } from './application/config.service'
import type { ConfigSeed } from './domain/ports/config-repository'
import { makeIndexedDbConfigRepository } from './infrastructure/indexed-db-config.adapter'

/**
 * A API pública do contexto de configuração (§1, §4).
 *
 * **Armazenamento: IndexedDB** (§7) — pela FORMA, não pelo tamanho: é o único que preserva os
 * `RegExp` que `accounts` e `rules` trarão. O critério completo está no adapter.
 *
 * A semente entra por parâmetro porque o `config` não pode conhecer quem gerou o JSON (§4).
 */
export function createConfigService(seed: ConfigSeed): ConfigService {
  return makeConfigService({ repository: makeIndexedDbConfigRepository(), seed })
}

export { emptyConfig, makeConfigService, type ConfigService, type ConfigServiceDeps } from './application/config.service'
export { InvalidConfigError } from './domain/errors'
export type { ConfigData, ConfigRepository, ConfigSeed } from './domain/ports/config-repository'
export { makeBundleDeclarations } from './infrastructure/bundle-declarations.adapter'
export { makeIndexedDbConfigRepository } from './infrastructure/indexed-db-config.adapter'
