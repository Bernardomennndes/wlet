import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deflateRawSync, deflateSync } from 'node:zlib'
import { inflate, inflateRaw, isSupported } from '@wlet/ingest/inflate'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { readSheet } from '@wlet/ingest/xlsx'
import { xlsxOf } from './support/xlsx-fixture'

/**
 * Os DOIS deflates, e por que trocá-los é um erro silencioso.
 *
 * O ZIP — e portanto o xlsx — guarda deflate CRU, sem cabeçalho. O `FlateDecode` de um PDF traz o
 * deflate COM o cabeçalho de dois bytes do zlib. São formatos diferentes de um mesmo algoritmo, e
 * o módulo expõe uma função para cada: `inflateRaw` e `inflate`.
 *
 * Nada exercitava nenhuma das duas. O fixture de xlsx usava só entradas STORED, então o
 * `method === 0` desviava do descompressor SEMPRE — o caminho que todo arquivo real percorre
 * nunca rodava. E trocar as duas não dá erro de tipo: as assinaturas são idênticas.
 */
const conteudo = 'linha,valor\nMERCADO X,-123.45\n'.repeat(400)

describe('cada formato tem o seu', () => {
  it('o cru vai e volta', async () => {
    const bytes = new Uint8Array(deflateRawSync(Buffer.from(conteudo)))
    assert.equal(new TextDecoder().decode(await inflateRaw(bytes)), conteudo)
  })

  it('o com cabeçalho também', async () => {
    const bytes = new Uint8Array(deflateSync(Buffer.from(conteudo)))
    assert.equal(new TextDecoder().decode(await inflate(bytes)), conteudo)
  })

  it('e um NÃO lê o outro — é isso que torna a troca detectável', async () => {
    // Sem esta prova, trocar `inflateRaw` por `inflate` em `xlsx.ts` passaria no typecheck e
    // falharia só diante de uma planilha de verdade. Aqui a incompatibilidade é afirmada.
    const cru = new Uint8Array(deflateRawSync(Buffer.from(conteudo)))
    const comCabecalho = new Uint8Array(deflateSync(Buffer.from(conteudo)))
    await assert.rejects(() => inflate(cru), 'o zlib recusa dado sem o cabeçalho dele')
    await assert.rejects(() => inflateRaw(comCabecalho), 'o cru não sabe o que fazer com os dois bytes da frente')
  })

  it('o conteúdo grande atravessa INTEIRO, em pedaços', async () => {
    // A saída vem em blocos e o módulo os concatena à mão, com um deslocamento acumulado — para
    // não pagar uma cópia a mais num xlsx da B3, que descomprime para alguns MB. Um off-by-one ali
    // produziria um arquivo truncado ou com lixo no meio, e o parser leria menos linhas sem
    // reclamar de nada.
    const grande = conteudo.repeat(40)
    const bytes = new Uint8Array(deflateRawSync(Buffer.from(grande)))
    const out = await inflateRaw(bytes)
    assert.equal(out.length, Buffer.byteLength(grande))
    assert.equal(new TextDecoder().decode(out), grande)
  })

  it('e o runtime tem o descompressor', () => {
    assert.equal(isSupported(), true)
  })
})

describe('o caminho que TODA planilha real percorre', () => {
  // As células precisam da REFERÊNCIA (`r="A1"`): o leitor chaveia a linha pela LETRA da coluna,
  // não pelo cabeçalho. Sem ela nenhuma coluna sai, e foi assim que a primeira versão deste teste
  // comparou dois resultados VAZIOS e passou — a igualdade entre nada e nada não prova nada.
  const rows = Array.from({ length: 50 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>PAPEL${i}</t></is></c><c r="B${i + 1}"><v>${i}</v></c></row>`)
  const planilha = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Posição" sheetId="1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
  }

  it('uma entrada DEFLATED é lida igual a uma STORED', async () => {
    // O `method === 8` é o que um xlsx de verdade traz. Enquanto o fixture só sabia STORED, este
    // ramo do leitor — e com ele o descompressor inteiro — não era exercitado por teste nenhum.
    const guardado: SourceFile = { path: 'docs/investimentos/a.xlsx', bytes: xlsxOf(planilha) }
    const comprimido: SourceFile = { path: 'docs/investimentos/b.xlsx', bytes: xlsxOf(planilha, { deflate: true }) }
    assert.ok(comprimido.bytes.length < guardado.bytes.length, 'o fixture comprimiu de verdade')
    assert.deepEqual(await readSheet(comprimido, browserEnv), await readSheet(guardado, browserEnv))
  })

  it('e as cinquenta linhas chegam inteiras', async () => {
    const read = await readSheet({ path: 'docs/investimentos/b.xlsx', bytes: xlsxOf(planilha, { deflate: true }) }, browserEnv)
    assert.equal(read.length, 50)
    assert.deepEqual(read[49], { A: 'PAPEL49', B: '49' }, 'a última linha atravessou o descompressor inteira')
  })
})
