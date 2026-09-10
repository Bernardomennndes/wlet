import { makePreferencesService, type PreferencesService } from './application/preferences.service'
import { makeLocalStoragePreferencesRepository } from './infrastructure/local-storage-preferences.adapter'

/**
 * A API pública do contexto de preferências (§1, §4).
 *
 * **Armazenamento: `localStorage`** (§7) — três campos, bytes, por navegador. E síncrono
 * importa aqui mais do que nos outros: o tema é lido no primeiro render, e esperar um banco
 * assíncrono para saber se a tela é clara ou escura produziria um flash.
 */
/**
 * O piso do período entra por PARÂMETRO, e isto não é preferência de estilo.
 *
 * Ele sai de `META.months[0]`, que vive em `@/lib/finance` — e aquele módulo chama `dataset()`
 * na sua própria avaliação. Importá-lo aqui faria o portão de boot ser violado pelo caminho
 * mais silencioso possível: `main.tsx` importa este barrel, o barrel importa `finance`, e
 * `finance` lê o dataset ANTES de alguém o ter carregado. O erro acontece no import, antes de
 * `start()` existir, então nem o `catch` do boot chega a rodar — o que se vê é uma página em
 * branco. Foi exatamente o que aconteceu, e `scripts/checks/services-boot.test.ts` é o que
 * impede de acontecer de novo.
 */
export function createPreferencesService(floorMonth: () => string): PreferencesService {
  return makePreferencesService({ repository: makeLocalStoragePreferencesRepository(), floorMonth })
}

export { makePreferencesService, type PreferencesService, type PreferencesServiceDeps } from './application/preferences.service'
export { InvalidPeriodError } from './domain/errors'
export type { Preferences, PreferencesRepository, Theme } from './domain/ports/preferences-repository'
export { makeLocalStoragePreferencesRepository } from './infrastructure/local-storage-preferences.adapter'
