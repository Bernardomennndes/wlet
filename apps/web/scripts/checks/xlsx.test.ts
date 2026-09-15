import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { readSheet, serialDate, sheetNames } from '@wlet/ingest/xlsx'
import { xlsxOf } from './support/xlsx-fixture'

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
 *
 * O construtor do ZIP mora em `support/xlsx-fixture.ts`: o teste do razão da corretora usa o mesmo.
 */

const WORKBOOK = '<workbook><sheets><sheet name="Posição" sheetId="1"/><sheet name="Movimentação" sheetId="2"/></sheets></workbook>'
const SHARED = '<sst><si><t>Produto</t></si><si><t>Casa &amp; Cia</t></si></sst>'

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`

const book = (files: Record<string, string>): SourceFile => ({ path: 'docs/investimentos/relatorio.xlsx', bytes: xlsxOf(files) })

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

/**
 * O ARQUIVO QUE NÃO É UMA PLANILHA — falhar alto é melhor que ler vazio.
 *
 * Os testes acima leem planilhas bem-formadas. Este leitor, porém, abre o que estiver em
 * `docs/investimentos/`: um download interrompido, um `.xlsx` que na verdade é um `.csv`
 * renomeado, um arquivo copiado pela metade de um pen drive.
 *
 * A distinção que importa é entre ERRO e VAZIO, e ela decide o que a pessoa vê. Uma planilha
 * ilegível lida como zero linhas não parece defeito: a tela de Patrimônio mostra que você não tem
 * nada, e o razão da corretora acusa que "não fecha" apontando para arquivo faltando — o
 * diagnóstico errado, sobre um arquivo que está lá. Por isso o leitor ESTOURA, e é isso que estes
 * testes prendem.
 *
 * Dentro de uma planilha válida a regra é a oposta: célula estranha se ignora, porque descartar
 * uma linha é melhor que perder o arquivo. As duas metades estão aqui, e a diferença entre elas é
 * o assunto.
 */
describe('o que não é planilha não é lido como planilha vazia', () => {
  it('arquivo que não é ZIP nenhum ESTOURA, dizendo o que faltou', async () => {
    // Sem o `if (eocd < 0)`, o laço termina e o leitor seguiria com um diretório central
    // inexistente — lendo zero entradas e devolvendo zero linhas, que é o modo de falha silencioso
    // que esta guarda existe para impedir.
    const naoEhZip: SourceFile = { path: 'docs/investimentos/posicao.xlsx', bytes: new TextEncoder().encode('Data;Produto;Valor\n01/01/2026;PETR4;100') }
    await assert.rejects(() => readSheet(naoEhZip, browserEnv, 1), /diretório central/)
  })

  it('e o diretório central corrompido também', async () => {
    // O caso do download interrompido: o fim do arquivo chegou, o começo não. A assinatura da
    // primeira entrada não bate, e continuar dali leria bytes arbitrários como nomes de arquivo.
    const bytes = xlsxOf({ 'xl/workbook.xml': WORKBOOK, 'xl/worksheets/sheet1.xml': sheet('') })
    const corrompido = new Uint8Array(bytes)
    // A assinatura da primeira entrada do diretório central é `PK\x01\x02`; basta trocar um byte.
    const at = corrompido.findIndex((_, i) => corrompido[i] === 0x50 && corrompido[i + 1] === 0x4b && corrompido[i + 2] === 0x01 && corrompido[i + 3] === 0x02)
    assert.notEqual(at, -1, 'o fixture precisa ter um diretório central para este teste valer')
    corrompido[at + 2] = 0xff

    await assert.rejects(() => readSheet({ path: 'docs/investimentos/posicao.xlsx', bytes: corrompido }, browserEnv, 1), /entrada do diretório central/)
  })
})

describe('dentro de uma planilha válida, a célula estranha se IGNORA', () => {
  it('célula sem referência de coluna não entra na linha', async () => {
    // `<c>` sem `r=` não tem como virar `{ coluna: valor }` — não há coluna. Estourar aqui perderia
    // a planilha inteira por causa de uma célula que alguns geradores emitem em branco.
    const file = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/worksheets/sheet1.xml': sheet('<row><c><v>órfã</v></c><c r="B" ><v>42</v></c></row>'),
    })
    assert.deepEqual(await readSheet(file, browserEnv, 1), [{ B: '42' }])
  })

  it('índice de string compartilhada fora da tabela vira VAZIO, e não `undefined`', async () => {
    // O `?? ''` de `shared[Number(value)]`. Um índice fora da faixa colocaria a string
    // "undefined" na célula — e ela viaja: vira descrição de lançamento, casa regra de categoria
    // nenhuma, e aparece na tela como um estabelecimento chamado "undefined".
    //
    // Como a célula vazia não entra na linha, o efeito certo é a coluna SUMIR.
    const file = book({
      'xl/workbook.xml': WORKBOOK,
      'xl/sharedStrings.xml': SHARED,
      'xl/worksheets/sheet1.xml': sheet('<row><c r="A" t="s"><v>99</v></c><c r="B" t="s"><v>1</v></c></row>'),
    })
    assert.deepEqual(await readSheet(file, browserEnv, 1), [{ B: 'Casa & Cia' }], 'a coluna A some; a B, que existe, atravessa')
  })
})
