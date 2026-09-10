import { translateStorageError } from '../domain/errors'
import { type EnvelopeSpec, open, wrap } from '../envelope'

/**
 * O adapter de `localStorage`: um agregado, uma chave, um envelope.
 *
 * **A forma é a atomicidade** (§3 da rule). `localStorage` não tem transação nenhuma, então
 * espalhar um agregado por várias chaves torna impossível escrevê-lo inteiro — a aba fecha
 * entre dois `setItem` e sobra um estado que nenhuma leitura sabe recusar. Um envelope só, num
 * `setItem` só, é o mais próximo de atômico que este armazenamento oferece.
 *
 * **Factory, não classe.** A rule da Selfie descreve adapters como classes com
 * `constructor(private readonly tx)`, e aqui isso não compila: o `tsconfig` liga
 * `erasableSyntaxOnly`, que proíbe parameter property. O projeto também não tem uma única
 * classe — closure é a forma da casa. A capacidade é a mesma; o que muda é o invólucro.
 *
 * O `Storage` entra por PARÂMETRO em vez de vir do global: é o que permite testar no runner do
 * Node, que não tem `window`. E `Storage` tem cinco métodos, então o fake é honesto. (§9)
 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StorageDriver<T> {
  read(): Promise<T>
  write(data: T): Promise<void>
  clear(): Promise<void>
}

/** O prefixo de toda chave, o mesmo de `src/lib/storage.ts`. Trocar isto renomeia o armazenamento. */
const PREFIX = 'wlet'

/**
 * O prefixo anterior, de quando o app se chamava Wallet.
 *
 * **Ele existe para os dados de quem já usa não sumirem**, e este driver precisa dele porque
 * substitui `src/lib/storage.ts` no caminho de leitura. O navegador não migra chave: sem esta
 * reserva, quem não abriu o app desde a renomeação teria `wallet.plans` gravado e o app leria
 * `wlet.plans`, que não existe — o catálogo apareceria VAZIO, sem erro, porque ausência de
 * chave é indistinguível de catálogo vazio.
 *
 * A migração COPIA em vez de mover: a chave antiga fica onde está, para uma volta de versão
 * não virar perda de dados.
 */
const LEGACY_PREFIX = 'wallet'

export function makeLocalStorageDriver<T>(storage: StorageLike, name: string, spec: EnvelopeSpec<T>): StorageDriver<T> {
  const key = `${PREFIX}.${name}`

  return {
    /**
     * Lê o agregado. **Não lança** por conteúdo — só por armazenamento inacessível.
     *
     * A distinção é a que importa: dado torto é problema daquele registro e cai no padrão;
     * armazenamento indisponível é problema do AMBIENTE e a tela precisa saber, senão ela
     * promete uma persistência que não vai acontecer.
     */
    async read() {
      let raw: string | null
      try {
        raw = storage.getItem(key)
        if (raw === null) {
          const legacy = storage.getItem(`${LEGACY_PREFIX}.${name}`)
          if (legacy !== null) {
            storage.setItem(key, legacy)
            raw = legacy
          }
        }
      } catch (cause) {
        throw translateStorageError(cause)
      }
      if (raw === null) return spec.empty()
      try {
        return open(spec, JSON.parse(raw))
      } catch {
        // JSON quebrado é conteúdo, não ambiente: cai no padrão como qualquer dado inválido.
        return spec.empty()
      }
    },

    async write(data) {
      try {
        storage.setItem(key, JSON.stringify(wrap(spec, data)))
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },

    async clear() {
      try {
        storage.removeItem(key)
      } catch (cause) {
        throw translateStorageError(cause)
      }
    },
  }
}

/** O `localStorage` do navegador, ou `null` onde ele não existe (runner do Node, SSR). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Um `Storage` que aceita tudo e não guarda nada.
 *
 * Onde o armazenamento não existe, o app precisa ABRIR — degradar para sessão volátil é melhor
 * do que uma tela de erro. É a única implementação de produção que mente de propósito, e por
 * isso mente de forma consistente: escreve com sucesso e lê vazio, que é exatamente o que um
 * navegador novo faz.
 */
export function volatileStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}
