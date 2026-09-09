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

/**
 * Quanto tempo o boot espera o IndexedDB antes de desistir dele.
 *
 * Não é otimização: `indexedDB.open` pode NUNCA responder. Outra aba segurando uma versão
 * anterior dispara `onblocked`, e há navegadores em que nem esse evento chega — o app ficaria
 * com a tela em branco para sempre, sem erro, sem pista. Medido aqui: no Chrome headless com
 * `--virtual-time-budget` o `open` não completa, e sem este limite o boot pendurava.
 *
 * Estourar o prazo não é falha: cai na semente, que é um app inteiro funcionando. O preço é
 * ficar somente-leitura nessa sessão, e o `origin` diz isso a quem chamou.
 */
const DB_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

export async function loadDataset(): Promise<LoadResult> {
  // Sem IndexedDB — modo privado restrito, navegador antigo — o app continua abrindo com o
  // que veio no build. Degradar para somente-leitura é melhor do que uma tela de erro: o
  // dataset da semente é um app inteiro funcionando.
  if (!isSupported()) return { data: await loadSeed(), origin: 'seed-sem-suporte' }

  try {
    const keys = await withTimeout(dbKeys('dataset'), DB_TIMEOUT_MS)
    if (keys && PARTS.every((part) => keys.includes(part))) {
      const values = await withTimeout(Promise.all(PARTS.map((part) => dbGet<unknown>('dataset', part))), DB_TIMEOUT_MS)
      if (values) {
        const data = Object.fromEntries(PARTS.map((part, i) => [part, values[i]])) as unknown as Dataset
        return { data, origin: 'indexeddb' }
      }
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
