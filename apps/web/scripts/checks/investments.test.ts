import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildInvestments } from '@wlet/ingest/investments'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { xlsxOf } from './support/xlsx-fixture'

/**
 * A reconstrução da carteira — o `asOf`, a posição e a série que a tela de Patrimônio desenha.
 *
 * O que este arquivo tranca é a ESCOLHA DO ARQUIVO, e ela tem um defeito medido no docblock do
 * módulo: a busca era `find()` na pasta, não recursiva e dependente da ordem, e "com uma cópia de
 * 2020 numa subpasta, a série saía VAZIA e o `asOf` retrocedia seis anos, sem erro nenhum". No
 * navegador a seleção de pasta entrega a subárvore inteira, então a ordem do `FileList` decidiria
 * qual posição vence.
 *
 * A correção foi passar a pegar o MAIS RECENTE por ordem lexicográfica — o nome carrega a data —,
 * e nada prendia isso.
 */
const SHEET = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`
const HEADER = '<row><c r="D" t="inlineStr"><is><t>Código</t></is></c></row>'

/** Uma linha de posição de renda variável: código em D, quantidade em I, valor em N (aba 1). */
const holding = (code: string, quantity: number, value: number) => `<row><c r="D" t="inlineStr"><is><t>${code}</t></is></c><c r="I" ><v>${quantity}</v></c><c r="N" ><v>${value}</v></c></row>`

const workbook = (sheets: number) => `<workbook><sheets>${Array.from({ length: sheets }, (_, n) => `<sheet name="Aba ${n + 1}" sheetId="${n + 1}"/>`).join('')}</sheets></workbook>`

const position = (path: string, rows: string): SourceFile => ({
  path,
  bytes: xlsxOf({
    'xl/workbook.xml': workbook(3),
    'xl/worksheets/sheet1.xml': SHEET(HEADER + rows),
    'xl/worksheets/sheet2.xml': SHEET(HEADER),
    'xl/worksheets/sheet3.xml': SHEET(HEADER),
  }),
})

const movement = (path: string): SourceFile => ({
  path,
  bytes: xlsxOf({ 'xl/workbook.xml': workbook(1), 'xl/worksheets/sheet1.xml': SHEET(HEADER) }),
})

describe('buildInvestments: a escolha do arquivo', () => {
  it('vence a posição MAIS RECENTE, mesmo com a antiga vindo PRIMEIRO na lista', async () => {
    // A cópia velha vem primeiro de propósito: é o arranjo que distingue. A primeira versão deste
    // teste punha a nova na frente, e aí `find()` acertava por acaso — o teste passava com o
    // defeito no lugar, que é o mesmo que não existir.
    //
    // O nome carrega a data, então ordem lexicográfica é ordem cronológica.
    const report = await buildInvestments(
      [
        position('docs/investimentos/antigo/posicao-2020-01-02.xlsx', holding('VALE3 - VALE', 50, 1000)),
        position('docs/investimentos/posicao-2026-09-05.xlsx', holding('PETR4 - PETROBRAS', 100, 4711)),
        movement('docs/investimentos/movimentacao-2026-09-05.xlsx'),
      ],
      browserEnv,
      [{ date: '2026-09-05', rate: 0.0005 }],
    )
    assert.ok(report)
    assert.equal(report.snapshot.asOf, '2026-09-05', 'o `asOf` não pode retroceder para a cópia antiga')
    assert.ok(
      report.snapshot.holdings.some((h) => h.code.startsWith('PETR4')),
      'a posição lida é a do arquivo novo',
    )
  })

  it('a ordem da lista NÃO decide — a mesma entrada invertida dá o mesmo resultado', async () => {
    // É a diferença entre determinístico e "depende da máquina de quem abriu a tela".
    const novo = position('docs/investimentos/posicao-2026-09-05.xlsx', holding('PETR4 - PETROBRAS', 100, 4711))
    const velho = position('docs/investimentos/antigo/posicao-2020-01-02.xlsx', holding('VALE3 - VALE', 50, 1000))
    const mov = movement('docs/investimentos/movimentacao-2026-09-05.xlsx')
    const cdi = [{ date: '2026-09-05', rate: 0.0005 }]

    const a = await buildInvestments([novo, velho, mov], browserEnv, cdi)
    const b = await buildInvestments([velho, novo, mov], browserEnv, cdi)
    assert.equal(a?.snapshot.asOf, b?.snapshot.asOf)
    assert.deepEqual(
      a?.snapshot.holdings.map((h) => h.code),
      b?.snapshot.holdings.map((h) => h.code),
    )
  })

  it('sem os DOIS relatórios da B3 não há o que reconstruir, e devolve null', async () => {
    // `null` é "não há relatório"; um relatório vazio seria "a carteira é zero", e a tela
    // mostraria patrimônio zerado em vez de dizer que falta o arquivo.
    assert.equal(await buildInvestments([position('docs/investimentos/posicao-2026-09-05.xlsx', '')], browserEnv, []), null, 'só a posição não basta')
    assert.equal(await buildInvestments([movement('docs/investimentos/movimentacao-2026-09-05.xlsx')], browserEnv, []), null, 'só a movimentação não basta')
  })

  it('sem CDI em cache o relatório SAI, mas com problema declarado', async () => {
    // A ausência do CDI não impede a carteira de existir — impede só a série histórica da renda
    // fixa. Derrubar tudo por causa dela esconderia a posição, que está ali.
    const report = await buildInvestments(
      [position('docs/investimentos/posicao-2026-09-05.xlsx', holding('PETR4 - PETROBRAS', 100, 4711)), movement('docs/investimentos/movimentacao-2026-09-05.xlsx')],
      browserEnv,
      [],
    )
    assert.ok(report)
    assert.ok(
      report.problems.some((p) => /CDI/.test(p)),
      'o relatório precisa dizer que o CDI falta',
    )
  })
})
