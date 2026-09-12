import { remote, type RemoteDeps } from '../../shared/infrastructure/orpc'
import type { Preferences, PreferencesRepository } from '../domain/ports/preferences-repository'

/**
 * As preferências, no servidor.
 *
 * Os três campos — recorte, período e tema — vão e voltam JUNTOS, porque a porta é um agregado:
 * meia preferência gravada é pior que nenhuma, e é isso que o `PUT /preferences` garante numa
 * transação só.
 */
export function makeOrpcPreferencesRepository({ client }: RemoteDeps): PreferencesRepository {
  return {
    find() {
      return remote(async () => (await client.preferences.get()) as Preferences)
    },
    async save(data) {
      await remote(() => client.preferences.set(data))
    },
  }
}
