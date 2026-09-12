/**
 * A API pública do contexto de ajustes manuais de categoria (§1, §4).
 *
 * **Armazenamento: o servidor.** Um ajuste é chaveado pelo `transaction.id`, e aquele id é
 * `sha1` de sete campos do lançamento — o mesmo em qualquer aparelho. Guardá-lo por navegador
 * significava recategorizar de novo no segundo aparelho, e perder tudo ao limpar os dados do
 * site.
 */
export { makeOverridesService, type OverridesService, type OverridesServiceDeps } from './application/overrides.service'
export { UnknownCategoryError } from './domain/errors'
export type { OverrideRepository } from './domain/ports/override-repository'
export { makeOrpcOverrideRepository } from './infrastructure/orpc-override.adapter'
