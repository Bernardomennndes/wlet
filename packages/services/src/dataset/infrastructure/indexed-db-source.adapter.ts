import { dbClear, dbGet, dbKeys } from '../../shared/infrastructure/db'
import { translateStorageError } from '../../shared/domain/errors'
import { replaceAllAtomic } from '../../shared/infrastructure/indexed-db.driver'
import type { SourceStore } from '../domain/ports/source-store'

/**
 * Os arquivos-fonte em IndexedDB, um registro por caminho.
 *
 * Um registro por arquivo, e não um blob só, porque a chave É o caminho: é ele que o pipeline
 * usa como identidade (`fatura/xp/` distingue o cartão da conta no mesmo banco), e guardá-lo
 * como chave torna a releitura trivial e a substituição de um arquivo só possível.
 *
 * O `Uint8Array` sobrevive ao *structured clone* sem serialização — é a razão de os bytes
 * poderem morar aqui e não em `localStorage`, que só guarda texto e precisaria de base64,
 * inflando 12 MB para 16 e ainda estourando a cota.
 */
const STORE = 'files'

export function makeIndexedDbSourceStore(): SourceStore {
  return {
    /**
     * Substitui o conjunto inteiro — um `docs/` novo não herda arquivo do anterior, senão um
     * extrato que a pessoa APAGOU continuaria produzindo lançamentos.
     *
     * Numa transação SÓ. Um `clear` seguido de um `put` são duas, e a aba que fecha entre elas
     * deixa o store vazio sem nada no lugar: perda de dado sem erro. A capacidade vem da
     * camada compartilhada em vez de ser reescrita aqui.
     */
    save: (sources) =>
      replaceAllAtomic(
        STORE,
        sources.map((s) => [s.path, s.bytes]),
      ),

    async load() {
      try {
        const paths = await dbKeys(STORE)
        const files = await Promise.all(paths.map(async (path) => ({ path, bytes: (await dbGet<Uint8Array>(STORE, path)) as Uint8Array })))
        return files.filter((f) => f.bytes instanceof Uint8Array)
      } catch {
        // Sem arquivos guardados o serviço trata como lista vazia — quem chamou decide o que
        // dizer, e a resposta certa é "escolha a pasta", não uma tela de erro.
        return []
      }
    },

    async count() {
      try {
        return (await dbKeys(STORE)).length
      } catch {
        return 0
      }
    },

    async clear() {
      try {
        await dbClear(STORE)
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },
  }
}
