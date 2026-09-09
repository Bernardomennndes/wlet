import { dbClear, dbGet, dbKeys } from '@/lib/db'
import type { Dataset } from '@/lib/dataset'
import { translateStorageError } from '@/services/shared/domain/errors'
import { writeManyAtomic } from '@/services/shared/infrastructure/indexed-db.driver'
import { DATASET_PARTS } from '../application/dataset.service'
import type { DatasetRepository } from '../domain/ports/dataset-repository'

/**
 * O conjunto ingerido em IndexedDB, uma parte por chave.
 *
 * **Por que IndexedDB** (§7): `transactions` sozinho tem 4,0 MB medidos. `localStorage` tem
 * cota de ~5 MB por origem e guarda em UTF-16 pela especificação, então os mesmos 4 MB pedem
 * ~8 MB. Não é margem apertada — é impossível.
 *
 * **Uma chave por parte, gravadas numa transação só.** Nove `put` separados deixariam o banco
 * meio semeado se a aba fechasse no meio, e é justamente esse estado que uma conferência por
 * "as chaves existem?" não distingue de um banco íntegro. Por isso `writeManyAtomic`, e por
 * isso o serviço ainda confere o CONTEÚDO ao ler.
 */
const STORE = 'dataset'

/**
 * Quanto o boot espera o banco antes de desistir dele.
 *
 * Não é otimização: `indexedDB.open` pode NUNCA responder — outra aba segurando uma versão
 * anterior dispara `onblocked`, e há casos em que nem esse evento chega. Medido nesta base: no
 * Chrome headless sob `--virtual-time-budget` o `open` não completa, e sem este limite o boot
 * pendurava com a tela em branco, sem erro e sem pista. Estourar o prazo cai na semente, que é
 * um app inteiro funcionando.
 */
const TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

export function makeIndexedDbDatasetRepository(): DatasetRepository {
  return {
    async find() {
      try {
        const keys = await withTimeout(dbKeys(STORE), TIMEOUT_MS)
        if (!keys || !DATASET_PARTS.every((part) => keys.includes(part))) return null
        const values = await withTimeout(Promise.all(DATASET_PARTS.map((part) => dbGet<unknown>(STORE, part))), TIMEOUT_MS)
        if (!values) return null
        return Object.fromEntries(DATASET_PARTS.map((part, i) => [part, values[i]])) as unknown as Dataset
      } catch {
        // Banco corrompido ou inacessível: o serviço trata `null` como "não há gravado".
        return null
      }
    },

    save: (data) =>
      writeManyAtomic(
        STORE,
        DATASET_PARTS.map((part) => [part, data[part]]),
      ),

    async clear() {
      try {
        await dbClear(STORE)
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },
  }
}
