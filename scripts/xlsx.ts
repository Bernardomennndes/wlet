import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

/**
 * Leitor mínimo de xlsx — só o suficiente para os relatórios da Área do Investidor da B3.
 *
 * Um xlsx é um ZIP com XML dentro. O projeto não tem nenhuma biblioteca de ZIP, e instalar
 * uma esbarra no guard de testes do repositório; `zlib.inflateRawSync` do próprio Node
 * resolve, e o formato é simples o bastante para caber em cem linhas. Mesmo caminho dos
 * testes, que rodam no runner embutido em vez de trazer um framework.
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

function readEntries(buf: Buffer): Map<string, ZipEntry> {
  // O fim do diretório central fica nos últimos 22 bytes, ou mais atrás se houver comentário.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('xlsx: fim do diretório central não encontrado')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const out = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('xlsx: entrada do diretório central inválida')
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    out.set(name, { name, offset, method, compressedSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function readFile(buf: Buffer, entry: ZipEntry): string {
  // O cabeçalho local repete o nome e o extra, com tamanhos PRÓPRIOS — os do diretório
  // central não servem aqui, e usar os errados desloca o início dos dados.
  const nameLen = buf.readUInt16LE(entry.offset + 26)
  const extraLen = buf.readUInt16LE(entry.offset + 28)
  const start = entry.offset + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  return (entry.method === 0 ? raw : inflateRawSync(raw)).toString('utf8')
}

/** Nome das abas, na ordem em que o Excel as numera (sheet1.xml, sheet2.xml, …). */
export function sheetNames(path: string): string[] {
  const buf = readFileSync(path)
  const wb = readFile(buf, readEntries(buf).get('xl/workbook.xml')!)
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
export function readSheet(path: string, sheet = 1): Record<string, string>[] {
  const buf = readFileSync(path)
  const entries = readEntries(buf)

  const sharedEntry = entries.get('xl/sharedStrings.xml')
  const shared = sharedEntry ? [...readFile(buf, sharedEntry).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : []

  const target = entries.get(`xl/worksheets/sheet${sheet}.xml`)
  if (!target) throw new Error(`xlsx: aba ${sheet} não existe em ${path}`)

  const rows: Record<string, string>[] = []
  for (const row of readFile(buf, target).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
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
