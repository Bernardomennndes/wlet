/**
 * IndexedDB cru, sem dependência — a sede dos dados quando eles saírem do bundle.
 *
 * Por que IndexedDB e não `localStorage`, que o app já usa para planos e overrides: o
 * `transactions.json` medido tem 4,0 MB, e `localStorage` tem cota de ~5 MB por origem E
 * guarda em UTF-16 pela especificação — os mesmos 4 MB ocupariam ~8 MB e estourariam. Não é
 * margem apertada, é impossível. IndexedDB guarda por *structured clone*, o que além do
 * tamanho preserva `RegExp` nativamente: `rules.config` tem 27 delas, e por JSON cada uma
 * viraria `{}`.
 *
 * O que NÃO está aqui, de propósito: índice, cursor, consulta. O app carrega o dataset
 * inteiro para a memória no boot e trabalha síncrono em cima dele (ver `dataset.ts`), então
 * o banco só precisa saber guardar e devolver um valor por chave. Índice sem consulta seria
 * estrutura para manter sem ninguém a usar.
 *
 * `localStorage` continua com o que é dele: preferência de tema e os rascunhos por navegador.
 * Config pequena e síncrona ali, dataset grande e assíncrono aqui — o arranjo normal.
 */
const DB_NAME = 'wlet'
const DB_VERSION = 1

/** Um store por natureza do dado, para um `clear()` poder atingir uma sem levar as outras. */
export const STORES = ['dataset', 'config', 'cache', 'files'] as const
export type StoreName = (typeof STORES)[number]

/**
 * Quanto qualquer leitura espera o banco antes de desistir dele.
 *
 * `indexedDB.open` pode NUNCA responder: outra aba segurando uma versão anterior dispara
 * `onblocked`, e há navegadores em que nem esse evento chega. Sem prazo, uma promessa que não
 * resolve pendura quem a espera — e o boot espera CINCO leituras num `Promise.all`, então uma
 * pendurada deixa o app em branco para sempre, sem erro e sem pista.
 *
 * Medido: era exatamente isso que fazia a tela alternar entre abrir e não abrir. O prazo
 * ficava só na leitura do conjunto; as outras quatro não tinham nenhum.
 *
 * Estourar o prazo NÃO é falha — é "não há dado gravado", e cada contexto já sabe o que fazer
 * com isso: cair na semente, ou no padrão.
 */
const READ_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), READ_TIMEOUT_MS))])
}

let opening: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  // A promessa é memoizada: `openDb()` é chamado por cada leitura do boot, e abrir a mesma
  // conexão várias vezes em paralelo dispara `onupgradeneeded` concorrente.
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
      }
    }
    req.onsuccess = () => {
      // Outra aba subindo uma versão nova precisa que esta conexão saia do caminho, senão o
      // upgrade dela fica bloqueado para sempre.
      req.result.onversionchange = () => {
        req.result.close()
        opening = null
      }
      resolve(req.result)
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'))
    req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba com versão anterior'))
  })
  return opening
}

function run<T>(store: StoreName, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = body(tx.objectStore(store))
        // O resultado sai do `onsuccess` do REQUEST, mas quem decide se durou é o `oncomplete`
        // da TRANSAÇÃO: uma escrita que falha no commit já teria "sucesso" no request.
        let value: T
        req.onsuccess = () => {
          value = req.result
        }
        tx.oncomplete = () => resolve(value)
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error(`falha em ${store}`))
        tx.onabort = () => reject(tx.error ?? new Error(`transação abortada em ${store}`))
      }),
  )
}

export function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return withTimeout(
    run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
    undefined,
  )
}

export function dbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  return run<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined)
}

export function dbDelete(store: StoreName, key: string): Promise<void> {
  return run<undefined>(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>).then(() => undefined)
}

export function dbKeys(store: StoreName): Promise<string[]> {
  return withTimeout(
    run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((keys) => keys.map(String)),
    [],
  )
}

export function dbClear(store: StoreName): Promise<void> {
  return run<undefined>(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>).then(() => undefined)
}

/**
 * Grava várias chaves do MESMO store numa transação só.
 *
 * O boot escreve nove partes do dataset de uma vez; nove transações separadas deixariam o
 * banco meio semeado se a aba fechasse no meio, e é justamente o estado que o `hasDataset`
 * não sabe distinguir de um banco íntegro.
 */
export function dbSetMany(store: StoreName, entries: [string, unknown][]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const s = tx.objectStore(store)
        for (const [key, value] of entries) s.put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error(`falha ao gravar em ${store}`))
        tx.onabort = () => reject(tx.error ?? new Error(`transação abortada em ${store}`))
      }),
  )
}

/**
 * Esvazia o store e regrava, TUDO numa transação só.
 *
 * Não é `dbClear` seguido de `dbSetMany`: são duas transações, e a aba que fecha entre elas
 * deixa o store vazio sem nada no lugar — perda de dado sem erro nenhum. É o mesmo problema
 * que `dbSetMany` já resolve para a escrita múltipla, agora estendido ao caso em que o que
 * havia antes precisa sair.
 *
 * "Substituir" e não "somar" é a semântica certa para um conjunto de arquivos: um extrato que
 * a pessoa apagou da pasta não pode continuar produzindo lançamentos.
 */
export function dbReplaceAll(store: StoreName, entries: [string, unknown][]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const s = tx.objectStore(store)
        s.clear()
        for (const [key, value] of entries) s.put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error(`falha ao substituir ${store}`))
        tx.onabort = () => reject(tx.error ?? new Error(`transação abortada em ${store}`))
      }),
  )
}

/**
 * Pede ao navegador para NÃO despejar este banco.
 *
 * Sem isto, o storage é "best-effort": sob pressão de disco o navegador limpa origens sem
 * aviso. Enquanto o dado vinha de arquivo isso era irrelevante — bastava reabrir o app. Com o
 * dataset morando aqui, um despejo apaga a única cópia, então a promoção a `persistent` deixa
 * de ser conforto e vira requisito. Devolve `false` quando o navegador recusa ou não suporta,
 * e é o chamador que decide o que dizer na tela.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}
