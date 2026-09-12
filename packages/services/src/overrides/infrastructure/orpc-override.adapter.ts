import type { Overrides } from '@wlet/domain'
import { remote, type RemoteDeps } from '../../shared/infrastructure/orpc'
import type { OverrideRepository } from '../domain/ports/override-repository'

/**
 * Os ajustes de categoria, no servidor.
 *
 * `save` recebe o mapa INTEIRO porque a porta é assim — ela nasceu de um armazenamento onde
 * gravar era escrever o documento todo. Aqui isso viraria N chamadas, então o adapter compara com
 * o que já existe e manda só o que MUDOU: a porta continua honesta e a rede não paga por ela.
 */
export function makeOrpcOverrideRepository({ client }: RemoteDeps): OverrideRepository {
  let ultimo: Overrides = {}

  return {
    async findAll() {
      ultimo = await remote(async () => (await client.overrides.list()) as Overrides)
      return { ...ultimo }
    },
    async save(next) {
      const chaves = new Set([...Object.keys(ultimo), ...Object.keys(next)])
      for (const id of chaves) {
        const antes = ultimo[id]
        const agora = next[id]
        if (antes === agora) continue
        // `null` REMOVE — é "volte ao que o ingest decidiu", e é o que o contrato declara.
        await remote(() => client.overrides.set({ transactionId: id, categoryId: agora ?? null }))
      }
      // Só depois do laço inteiro: uma falha no meio deixa `ultimo` no estado ANTERIOR, e a
      // próxima gravação reenvia o que não passou. Atualizar por item faria o adapter esquecer
      // exatamente o ajuste que não chegou.
      ultimo = { ...next }
    },
  }
}
