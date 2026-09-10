import type { RemoteDeps } from '../../shared/infrastructure/orpc'
import type { Preferences, PreferencesRepository } from '../domain/ports/preferences-repository'

/**
 * As preferências, no servidor.
 *
 * Implementa a MESMA porta do adapter de `localStorage` — é essa simetria que torna a troca um
 * detalhe de montagem, e não uma reescrita. O serviço, os casos de uso e os testes seguem
 * idênticos; só muda quem responde.
 */
export function makeOrpcPreferencesRepository({ client }: RemoteDeps): PreferencesRepository {
  return {
    async find() {
      return (await client.preferences.get()) as Preferences
    },
    async save(data) {
      await client.preferences.set(data)
    },
  }
}
