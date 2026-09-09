/**
 * O estado do navegador em JSON — ida e volta, para o botão de exportar e importar.
 *
 * Existe por causa de um problema concreto: quando os dados saem do arquivo e passam a morar
 * no IndexedDB, o navegador vira a ÚNICA cópia, e storage de navegador é despejável — sob
 * pressão de disco ou num "limpar dados do site" ele vai embora sem aviso. O arquivo exportado
 * é a resposta a isso, e por isso ele precisa ser um JSON comum, que a pessoa consiga guardar
 * em qualquer lugar e ler com qualquer coisa.
 *
 * **O que o JSON não sabe representar, e aqui precisa:** `RegExp`. O IndexedDB guarda por
 * *structured clone* e preserva expressão regular nativamente, mas `JSON.stringify(/x/i)`
 * devolve `{}` — sem erro. São 27 delas em `rules.config` e 2 em `accounts.config`: exportar
 * sem tratá-las produziria um arquivo que importa "com sucesso" e deixa a categorização
 * inteira sem regra nenhuma. A troca é uma marca explícita (`$re`), e não um formato
 * inventado por posição, para o arquivo continuar legível por quem o abrir num editor.
 *
 * `Date` recebe o mesmo tratamento (`$date`) pela mesma razão: o structured clone preserva,
 * o JSON degrada para string e a volta traria texto onde havia data.
 */
type Marked = { $re: string; $flags: string } | { $date: string }

function isMarked(value: unknown): value is Marked {
  return typeof value === 'object' && value !== null && ('$re' in value || '$date' in value)
}

/** Converte o que o JSON perderia em marcas explícitas. Recursivo, preserva o resto. */
export function encode(value: unknown): unknown {
  if (value instanceof RegExp) return { $re: value.source, $flags: value.flags }
  if (value instanceof Date) return { $date: value.toISOString() }
  if (Array.isArray(value)) return value.map(encode)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]))
  }
  return value
}

/**
 * Desfaz as marcas. Uma marca malformada vira `undefined` em vez de lançar: o arquivo é
 * escolhido pela pessoa e pode ter sido editado à mão, e derrubar a importação inteira por
 * causa de uma regra torta é pior do que perder a regra — o mesmo critério do `parsePlans`.
 */
export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (isMarked(value)) {
    if ('$re' in value) {
      try {
        return new RegExp(value.$re, value.$flags ?? '')
      } catch {
        return undefined
      }
    }
    const parsed = new Date(value.$date)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]))
  }
  return value
}

/** A versão do ARQUIVO exportado, independente da versão de cada envelope que ele carrega. */
export const SNAPSHOT_VERSION = 1

export interface Snapshot {
  version: number
  exportedAt: string
  app: 'wlet'
  payload: Record<string, unknown>
}

export function toJson(payload: Record<string, unknown>): string {
  const snapshot: Snapshot = { version: SNAPSHOT_VERSION, exportedAt: new Date().toISOString(), app: 'wlet', payload: encode(payload) as Record<string, unknown> }
  return JSON.stringify(snapshot, null, 2)
}

/**
 * Lê um arquivo exportado. Devolve `null` — e não um snapshot vazio — quando o arquivo não é
 * deste app: importar "com sucesso" um arquivo alheio apagaria o estado atual em silêncio.
 */
export function fromJson(text: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(text) as Partial<Snapshot>
    if (raw.app !== 'wlet' || raw.version !== SNAPSHOT_VERSION) return null
    if (!raw.payload || typeof raw.payload !== 'object') return null
    return decode(raw.payload) as Record<string, unknown>
  } catch {
    return null
  }
}
