/**
 * A API pública do contexto de preferências (§1, §4).
 *
 * **Armazenamento: o servidor.** São três campos — recorte, período e tema —, e eles seguem o
 * mesmo caminho dos outros quatro contextos porque a promessa mudou: a mesma conta abre igual em
 * dois aparelhos. O preço é que o tema deixa de ser legível de forma síncrona no primeiro
 * render; quem paga esse preço é o portão de boot, que carrega antes de montar.
 */
export { makePreferencesService, type PreferencesService, type PreferencesServiceDeps } from './application/preferences.service'
export { InvalidPeriodError } from './domain/errors'
export type { Preferences, PreferencesRepository, Theme } from './domain/ports/preferences-repository'
export { makeOrpcPreferencesRepository } from './infrastructure/orpc-preferences.adapter'
