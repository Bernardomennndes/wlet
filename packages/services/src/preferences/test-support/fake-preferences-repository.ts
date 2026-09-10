import type { Preferences, PreferencesRepository } from '../domain/ports/preferences-repository'

/** Fake in-memory (§9). NÃO é código de produção. */
export function makeFakePreferencesRepository(initial?: Partial<Preferences>): PreferencesRepository & { snapshot(): Preferences } {
  let data: Preferences = { scope: null, period: null, theme: null, ...initial }
  return {
    async find() {
      return { ...data }
    },
    async save(next) {
      data = { ...next }
    },
    snapshot: () => ({ ...data }),
  }
}
