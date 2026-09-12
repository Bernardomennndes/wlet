/**
 * A API pública do contexto de configuração (§1, §4).
 *
 * **Armazenamento: o servidor.** Não há mais escolha a fazer aqui — as declarações moram em
 * Postgres e chegam por `/v1/config`. O adapter de IndexedDB que existia ao lado deste barrel
 * foi removido junto com o modo local: dois armazenamentos para o mesmo dado significavam duas
 * respostas possíveis para "qual é a minha configuração?", e a que o `pnpm ingest` do terminal
 * enxergava nunca era a do navegador.
 *
 * A semente continua entrando por parâmetro de quem MONTA o serviço, porque `config` não pode
 * conhecer quem gerou o JSON do bundle (§4).
 */
export { emptyConfig, makeConfigService, type ConfigService, type ConfigServiceDeps } from './application/config.service'
export { InvalidConfigError } from './domain/errors'
export type { ConfigData, ConfigRepository, ConfigSeed } from './domain/ports/config-repository'
export { makeOrpcConfigRepository } from './infrastructure/orpc-config.adapter'
