import type { IngestEnv, SourceFile } from './io'
import { decodeText } from './io'

/**
 * Leitor mínimo de xlsx — só o suficiente para os relatórios da Área do Investidor da B3.
 *
 * Um xlsx é um ZIP com XML dentro. O projeto não tem nenhuma biblioteca de ZIP, e instalar
 * uma esbarra no guard de testes do repositório; um inflate de deflate CRU resolve, e o
 * formato é simples o bastante para caber em cem linhas.
 *
 * O inflate NÃO é importado: vem no `IngestEnv` (`src/lib/ingest/io.ts`). No Node ele é o
 * `zlib.inflateRawSync` resolvido na hora; no navegador é o `DecompressionStream`, que só
 * existe assíncrono. É por isso que `sheetNames` e `readSheet` retornam `Promise` — a
 * assinatura é a mesma nos dois ambientes, porque assinatura que muda por ambiente é
 * duplicação por outro nome.
 *
 * O caminho do arquivo também não é lido daqui: chega em `SourceFile`, com os bytes já em
 * mãos, porque no navegador não há sistema de arquivos.
 *
 * O que NÃO é suportado, e não precisa ser: fórmulas, células mescladas, ZIP64. Os
 * relatórios da B3 são texto e número puros — mas o extrato da corretora traz data como
 * NÚMERO DE SÉRIE, e para essa há `serialDate` no fim do arquivo.
 */

interface ZipEntry {
  name: string
  offset: number
  method: number
  compressedSize: number
}

function readEntries(bytes: Uint8Array, view: DataView): Map<string, ZipEntry> {
  // O fim do diretório central fica nos últimos 22 bytes, ou mais atrás se houver comentário.
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('xlsx: fim do diretório central não encontrado')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)

  const out = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('xlsx: entrada do diretório central inválida')
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    const name = decodeText(bytes.subarray(p + 46, p + 46 + nameLen))
    out.set(name, { name, offset, method, compressedSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

async function readFile(bytes: Uint8Array, view: DataView, entry: ZipEntry, env: IngestEnv): Promise<string> {
  // O cabeçalho local repete o nome e o extra, com tamanhos PRÓPRIOS — os do diretório
  // central não servem aqui, e usar os errados desloca o início dos dados.
  const nameLen = view.getUint16(entry.offset + 26, true)
  const extraLen = view.getUint16(entry.offset + 28, true)
  const start = entry.offset + 30 + nameLen + extraLen
  const raw = bytes.subarray(start, start + entry.compressedSize)
  return decodeText(entry.method === 0 ? raw : await env.inflateRaw(raw))
}

/** Os bytes de um `SourceFile` prontos para leitura aleatória — a `DataView` respeita o `byteOffset`. */
function open(file: SourceFile): { bytes: Uint8Array; view: DataView } {
  const bytes = file.bytes
  return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
}

/** Nome das abas, na ordem em que o Excel as numera (sheet1.xml, sheet2.xml, …). */
export async function sheetNames(file: SourceFile, env: IngestEnv): Promise<string[]> {
  const { bytes, view } = open(file)
  const wb = await readFile(bytes, view, readEntries(bytes, view).get('xl/workbook.xml')!, env)
  return [...wb.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((m) => decode(m[1]))
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

/** Todo o texto de um nó, concatenado — uma célula rica vem partida em vários `<t>`. */
function textOf(xml: string): string {
  return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('')
}

/**
 * As linhas de uma aba, cada uma como `{ coluna: valor }` — "A", "B", "C"… A célula vazia
 * simplesmente não aparece, que é como o próprio formato a representa.
 */
export async function readSheet(file: SourceFile, env: IngestEnv, sheet = 1): Promise<Record<string, string>[]> {
  const { bytes, view } = open(file)
  const entries = readEntries(bytes, view)

  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const shared = sharedEntry ? [...(await readFile(bytes, view, sharedEntry, env)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : []

  const target = entries.get(`xl/worksheets/sheet${sheet}.xml`)
  if (!target) throw new Error(`xlsx: aba ${sheet} não existe em ${file.path}`)

  const rows: Record<string, string>[] = []
  for (const row of (await readFile(bytes, view, target, env)).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {}
    for (const cell of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /r="([A-Z]+)/.exec(cell[1])?.[1]
      if (!ref) continue
      const type = /t="([^"]+)"/.exec(cell[1])?.[1]
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1]
      // `t="s"` é índice na tabela de strings; `t="inlineStr"` traz o texto na própria célula.
      const text = type === 's' && value !== undefined ? (shared[Number(value)] ?? '') : type === 'inlineStr' ? textOf(cell[2]) : decode(value ?? '')
      if (text !== '') cells[ref] = text
    }
    if (Object.keys(cells).length) rows.push(cells)
  }
  return rows
}

/**
 * A data por trás de um número de série do Excel.
 *
 * A época é 1899-12-30, e não 1900-01-01: o Excel herdou do Lotus 1-2-3 a crença de que
 * 1900 foi bissexto, então tudo a partir de 1º de março de 1900 está um dia adiantado.
 * Contar a partir de 30/12/1899 cancela o erro para qualquer data real — e os extratos da
 * corretora começam em 2022.
 *
 * O extrato da B3 escreve data como texto (`dd/mm/aaaa`); o da corretora, como serial. É
 * por isso que as duas formas convivem: cada relatório é gerado por um sistema diferente.
 */
export function serialDate(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10)
}
