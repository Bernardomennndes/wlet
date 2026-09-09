import { dbGet, dbKeys, dbSetMany, isSupported } from './db'
import type { Dataset } from './dataset'
import { loadSeed } from './dataset-seed'

/**
 * De onde o dataset vem no boot, e a regra que decide entre banco e semente.
 *
 * A pergunta "o banco já tem dado?" é respondida por PARTE PRESENTE, não por um sinalizador
 * separado: um sinalizador pode sobreviver a uma gravação interrompida e afirmar que existe
 * um dataset que só está pela metade. Exigir as nove chaves torna o estado meio-gravado
 * indistinguível de banco vazio — e cair na semente é o comportamento certo nos dois casos.
 */
const PARTS = ['accounts', 'meta', 'transactions', 'transfers', 'planned', 'receivables', 'budget', 'goals', 'investments'] as const

export type DatasetOrigin = 'indexeddb' | 'seed' | 'seed-sem-suporte'

export interface LoadResult {
  data: Dataset
  origin: DatasetOrigin
}

export async function loadDataset(): Promise<LoadResult> {
  // Sem IndexedDB — modo privado restrito, navegador antigo — o app continua abrindo com o
  // que veio no build. Degradar para somente-leitura é melhor do que uma tela de erro: o
  // dataset da semente é um app inteiro funcionando.
  if (!isSupported()) return { data: await loadSeed(), origin: 'seed-sem-suporte' }

  try {
    const keys = new Set(await dbKeys('dataset'))
    if (PARTS.every((part) => keys.has(part))) {
      const values = await Promise.all(PARTS.map((part) => dbGet<unknown>('dataset', part)))
      const data = Object.fromEntries(PARTS.map((part, i) => [part, values[i]])) as unknown as Dataset
      return { data, origin: 'indexeddb' }
    }
  } catch {
    // Banco corrompido ou inacessível não pode impedir o app de abrir: a semente responde.
  }
  return { data: await loadSeed(), origin: 'seed' }
}

/** Grava o dataset inteiro numa transação só — ver `dbSetMany`. */
export function saveDataset(data: Dataset): Promise<void> {
  return dbSetMany(
    'dataset',
    PARTS.map((part) => [part, data[part]]),
  )
}
