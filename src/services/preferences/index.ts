import { META } from '@/lib/finance'
import { makePreferencesService, type PreferencesService } from './application/preferences.service'
import { makeLocalStoragePreferencesRepository } from './infrastructure/local-storage-preferences.adapter'

/**
 * A API pública do contexto de preferências (§1, §4).
 *
 * **Armazenamento: `localStorage`** (§7) — três campos, bytes, por navegador. E síncrono
 * importa aqui mais do que nos outros: o tema é lido no primeiro render, e esperar um banco
 * assíncrono para saber se a tela é clara ou escura produziria um flash.
 */
export function createPreferencesService(): PreferencesService {
  return makePreferencesService({
    repository: makeLocalStoragePreferencesRepository(),
    floorMonth: () => META.months[0],
  })
}

export { makePreferencesService, type PreferencesService, type PreferencesServiceDeps } from './application/preferences.service'
export { InvalidPeriodError } from './domain/errors'
export type { Preferences, PreferencesRepository, Theme } from './domain/ports/preferences-repository'
export { makeLocalStoragePreferencesRepository } from './infrastructure/local-storage-preferences.adapter'
