import { dbClear, dbGet, dbReplaceAll, dbSet, dbSetMany, type StoreName } from '@/lib/db'
import { translateStorageError } from '../domain/errors'
import { type EnvelopeSpec, open, wrap } from '../envelope'
import type { StorageDriver } from './local-storage.driver'

/**
 * O adapter de IndexedDB — deliberadamente FINO, e a §9 da rule diz por quê em vez de esconder.
 *
 * IndexedDB não é testável no runner do Node sem dependência nova (`fake-indexeddb`), e o
 * projeto é construído para não ter uma: o leitor de xlsx, o de PDF e o próprio runner de
 * testes seguem a mesma linha. A resposta não é testar mal — é deixar aqui o MÍNIMO que pode
 * dar errado: nenhuma regra de negócio, só chave, envelope e tradução de erro. O que vale um
 * teste mora no `application/`, que roda sobre fake.
 *
 * Cumpre o MESMO `StorageDriver<T>` do adapter de `localStorage` (§6): o serviço acima não sabe
 * qual dos dois recebeu, e é isso que permite a escolha da §7 ser trocada sem tocar no domínio.
 */
export function makeIndexedDbDriver<T>(store: StoreName, name: string, spec: EnvelopeSpec<T>): StorageDriver<T> {
  return {
    async read() {
      try {
        const raw = await dbGet<unknown>(store, name)
        return raw === undefined ? spec.empty() : open(spec, raw)
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },

    /**
     * Grava o envelope INTEIRO, não um delta.
     *
     * O IndexedDB aceitaria guardar registro a registro e indexá-los, e não é o que se quer: o
     * app carrega tudo para a memória no boot e trabalha síncrono em cima (`dataset.ts`), então
     * índice e cursor seriam estrutura para manter sem consumidor nenhum.
     */
    async write(data) {
      try {
        await dbSet(store, name, wrap(spec, data))
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },

    async clear() {
      try {
        await dbClear(store)
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },
  }
}

/**
 * Grava vários agregados do mesmo store numa transação só.
 *
 * É a §3 da rule na prática. O caso concreto é o boot: nove partes do dataset em nove
 * transações separadas deixam o banco meio semeado se a aba fechar no meio — e "meio semeado" é
 * indistinguível de "íntegro" para quem só confere se as chaves existem.
 */
export async function writeManyAtomic(store: StoreName, entries: [string, unknown][]): Promise<void> {
  try {
    await dbSetMany(store, entries)
  } catch (cause) {
    throw translateStorageError(cause)
  }
}

/**
 * Substitui o conteúdo inteiro de um store, numa transação só.
 *
 * O irmão de `writeManyAtomic` para quando o que estava lá precisa SAIR. Separá-los é o que
 * evita cada contexto escrever o seu próprio "limpa e regrava" em duas transações — que é
 * justamente a forma de perder dado sem erro.
 */
export async function replaceAllAtomic(store: StoreName, entries: [string, unknown][]): Promise<void> {
  try {
    await dbReplaceAll(store, entries)
  } catch (cause) {
    throw translateStorageError(cause)
  }
}
