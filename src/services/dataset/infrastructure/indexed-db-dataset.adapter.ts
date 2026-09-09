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

export function makeIndexedDbDatasetRepository(): DatasetRepository {
  return {
    async find() {
      try {
        // O prazo vive em `src/lib/db.ts` e vale para toda leitura — uma cópia por adapter
        // era o que deixava as outras quatro sem nenhum (§10).
        const keys = await dbKeys(STORE)
        if (!DATASET_PARTS.every((part) => keys.includes(part))) return null
        const values = await Promise.all(DATASET_PARTS.map((part) => dbGet<unknown>(STORE, part)))
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
