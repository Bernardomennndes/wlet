import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { readSheet, serialDate, sheetNames } from '@wlet/ingest/xlsx'

/**
 * O leitor de xlsx — a porta por onde entram os relatórios da B3 e o extrato da corretora.
 *
 * Ficou sem teste enquanto a razão registrada era "lê formato binário, e um fixture sintético é
 * caro de escrever". Caro não era: o leitor aceita entrada ZIP **STORED** (`method === 0`, em
 * `xlsx.ts`), então o fixture é um ZIP SEM COMPRESSÃO — cabeçalho local, dados crus, diretório
 * central. Quarenta linhas, nenhum byte de dado de ninguém, e nenhuma dependência nova.
 *
 * O que se ganha é o caminho inteiro: a planilha vira `{ coluna: valor }`, e é dessa forma que
 * `brokerage.ts` e `investments.ts` leem posição, movimentação e proventos. Um erro aqui move a
 * carteira inteira sem estourar nada.
 */

// ---------------------------------------------------------------------------
// Um xlsx mínimo: ZIP com entradas STORED
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Um ZIP de entradas STORED. É o mínimo que `readEntries` de `xlsx.ts` precisa saber ler. */
function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(content)
    const sum = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // assinatura do cabeçalho local
    lv.setUint16(4, 20, true) // versão necessária
    lv.setUint16(8, 0, true) // método 0 = STORED
    lv.setUint32(14, sum, true)
    lv.setUint32(18, data.length, true) // comprimido
    lv.setUint32(22, data.length, true) // sem compressão: os dois são iguais
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    const entry = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true) // assinatura do diretório central
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, sum, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    entry.set(nameBytes, 46)

    parts.push(local, data)
    central.push(entry)
    offset += local.length + data.length
  }

  const centralSize = central.reduce((total, e) => total + e.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // fim do diretório central
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((total, p) => total + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const WORKBOOK = '<workbook><sheets><sheet name="Posição" sheetId="1"/><sheet name="Movimentação" sheetId="2"/></sheets></workbook>'
const SHARED = '<sst><si><t>Produto</t></si><si><t>Casa &amp; Cia</t></si></sst>'

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`

const book = (files: Record<string, string>): SourceFile => ({ path: 'docs/investimentos/relatorio.xlsx', bytes: zip(files) })

describe('sheetNames', () => {
  it('lê os nomes das abas, com acento', async () => {
    const file = book({ 'xl/workbook.xml': WORKBOOK, 'xl/worksheets/sheet1.xml': sheet('') })
    assert.deepEqual(await sheetNames(file, browserEnv), ['Posição', 'Movimentação'])
  })
})

describe('readSheet', () => {
  it('cada linha vira `{ coluna: valor }`, e a célula vazia não aparece', async () => {
    // É como o próprio formato a representa: a ausência não é string vazia, é a chave faltando.
    const rows = '<row><c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="C1"><v>42</v></c></row>'
    const file = book({ 'xl/workbook.xml': WORKBOOK, 'xl/worksheets/sheet1.xml': sheet(rows) })
    const [first] = await readSheet(file, browserEnv)
    assert.deepEqual(first, { A: 'Nome', C: '42' })
    assert.equal('B' in first, false, 'a coluna vazia não vira chave')
  })

  it('`t="s"` é ÍNDICE na tabela de strings, não o texto', async () => {
    // Confundir os dois faria a planilha inteira ler números onde há nomes — e o índice 1 é um
    // texto válido, então o erro não estouraria: viria "1" no lugar de "Casa & Cia".
    const rows = '<row><c r="A1" t="s"><v>1</v></c></row>'
    const file = book({ 'xl/workbook.xml': WORKBOOK, 'xl/sharedStrings.xml': SHARED, 'xl/worksheets/sheet1.xml': sheet(rows) })
    assert.deepEqual(await readSheet(file, browserEnv), [{ A: 'Casa & Cia' }], 'e a entidade XML volta decodificada')
  })

  it('uma célula rica vem partida em vários `<t>`, e é concatenada', async () => {
    const rows = '<row><c r="A1" t="inlineStr"><is><t>CDB </t><t>BANCO XP</t></is></c></row>'
    const file = book({ 'xl/workbook.xml': WORKBOOK, 'xl/worksheets/sheet1.xml': sheet(rows) })
    assert.deepEqual(await readSheet(file, browserEnv), [{ A: 'CDB BANCO XP' }])
  })

  it('a segunda aba é alcançável por índice', async () => {
    const file = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/worksheets/sheet1.xml': sheet('<row><c r="A1" t="inlineStr"><is><t>primeira</t></is></c></row>'),
      'xl/worksheets/sheet2.xml': sheet('<row><c r="A1" t="inlineStr"><is><t>segunda</t></is></c></row>'),
    })
    assert.deepEqual(await readSheet(file, browserEnv, 2), [{ A: 'segunda' }])
  })

  it('aba que não existe FALHA dizendo qual arquivo', async () => {
    // Devolver lista vazia faria a carteira aparecer zerada, que é indistinguível de "vendi tudo".
    const file = book({ 'xl/workbook.xml': WORKBOOK, 'xl/worksheets/sheet1.xml': sheet('') })
    await assert.rejects(() => readSheet(file, browserEnv, 9), /relatorio\.xlsx/)
  })
})

describe('serialDate', () => {
  it('converte o serial do Excel contando de 30/12/1899', async () => {
    // A origem é 30/12 e não 31/12 de propósito: o Excel acredita que 1900 foi bissexto, e contar
    // do dia anterior cancela o erro para qualquer data real. Um dia de deslocamento aqui move
    // todo lançamento da corretora para a véspera.
    assert.equal(serialDate(1), '1899-12-31')
    assert.equal(serialDate(45658), '2025-01-01')
  })

  it('arredonda o serial fracionário — a hora não vira outro dia', () => {
    // O extrato traz data com hora em algumas linhas. Truncar em vez de arredondar puxaria o
    // fim da tarde para o dia anterior.
    assert.equal(serialDate(45658.75), '2025-01-02')
    assert.equal(serialDate(45658.25), '2025-01-01')
  })
})
