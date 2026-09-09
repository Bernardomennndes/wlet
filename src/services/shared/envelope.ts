import { CorruptedDataError } from './domain/errors'

/**
 * O envelope versionado, num lugar só.
 *
 * O projeto já tinha um, escrito à mão dentro de `src/lib/plans.ts`, e o comentário de lá
 * explica por que ele existe: dado de navegador que nasce sem versão não tem migração — quando
 * a forma muda, o gravado vira lixo silencioso e o app lê campos que não existem sem erro
 * nenhum. Aquele envelope já se pagou uma vez (a versão 1 dos planos virou 2 sem perder nada).
 *
 * Este módulo é a MESMA ideia extraída, para os contextos novos não escreverem a sétima cópia
 * de "ler, conferir versão, migrar, cair no padrão" — é a §10 da rule aplicada antes de o
 * problema existir. `plans.ts` continua com o dele até a virada: trocar a implementação de um
 * dado que já está gravado em navegadores reais é migração, não infraestrutura.
 */
export interface Envelope<T> {
  version: number
  data: T
}

/** Converte um envelope de versão anterior. Devolve `null` quando não sabe converter. */
export type Migration<T> = (data: unknown, from: number) => T | null

export interface EnvelopeSpec<T> {
  /** A versão que o código de hoje escreve. */
  version: number
  /** O valor de um armazenamento vazio. Chamado, e não constante, para ninguém compartilhar a instância. */
  empty: () => T
  /**
   * Valida o que veio de fora. Nada é confiável: o `localStorage` pode ter sido editado à mão e
   * o arquivo importado é escolhido pela pessoa. Devolve `null` para rejeitar.
   */
  parse: (data: unknown) => T | null
  /** Converte versões anteriores. Ausente: versão antiga é rejeitada e cai no padrão. */
  migrate?: Migration<T>
  /**
   * O agregado JÁ carrega `version` dentro de si, e o envelope é ele próprio.
   *
   * Existe por um caso real, não por simetria: os planos são gravados como
   * `{ version, groups, items }` desde antes desta camada, e há navegadores com esse conteúdo
   * agora. Embrulhá-los em `{ version, data }` faria o app ler `data: undefined` e abrir o
   * catálogo vazio — sem erro, porque ausência de chave é indistinguível de catálogo vazio.
   * Compatibilidade com o que está gravado ganha de uniformidade de formato.
   */
  selfVersioned?: boolean
}

export function wrap<T>(spec: EnvelopeSpec<T>, data: T): unknown {
  return spec.selfVersioned ? { ...(data as object), version: spec.version } : { version: spec.version, data }
}

/**
 * Abre um envelope cru.
 *
 * Nunca lança por conteúdo inválido — devolve o padrão. Derrubar a tela porque uma chave do
 * navegador está torta é pior do que abrir vazia: a pessoa perde o acesso ao resto do app por
 * causa de um dado que ela nem sabe que existe. É o mesmo critério do `parsePlans`.
 */
export function open<T>(spec: EnvelopeSpec<T>, raw: unknown): T {
  if (!raw || typeof raw !== 'object') return spec.empty()
  const envelope = raw as Partial<Envelope<unknown>>
  if (typeof envelope.version !== 'number') return spec.empty()

  // Auto-versionado: o próprio objeto é o dado, então é ele que vai ao `parse`.
  const payload = spec.selfVersioned ? raw : envelope.data
  if (envelope.version === spec.version) {
    return spec.parse(payload) ?? spec.empty()
  }
  // Versão à FRENTE da conhecida também cai aqui, e cair no padrão é o certo: significa que o
  // navegador rodou uma versão mais nova do app, e adivinhar a forma dela inventaria dado.
  const migrated = spec.migrate?.(payload, envelope.version)
  return migrated ?? spec.empty()
}

/** Como `open`, mas LANÇA em vez de cair no padrão. Para importação de arquivo, onde o silêncio esconderia um arquivo errado. */
export function openStrict<T>(spec: EnvelopeSpec<T>, raw: unknown): T {
  const value = open(spec, raw)
  if (raw && typeof raw === 'object' && Object.keys(raw).length > 0 && JSON.stringify(value) === JSON.stringify(spec.empty())) {
    throw new CorruptedDataError()
  }
  return value
}
