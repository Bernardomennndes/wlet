import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildInvestments } from '@wlet/ingest/investments'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { xlsxOf } from './support/xlsx-fixture'

/**
 * A RECONSTRUÇÃO da carteira mês a mês — e o fixture que evitava o caminho real.
 *
 * O teste que já existe monta um arquivo de movimentação VAZIO: ele prova a escolha do arquivo,
 * que é o defeito que aquele módulo teve, e nunca chega ao que vem depois. Sem movimento não há
 * instrumento, sem instrumento não há série, e mais da metade das funções do módulo não rodava.
 *
 * O que a reconstrução faz é responder "quanto eu tinha em cada mês" a partir de uma posição de
 * HOJE e do histórico de compras e vendas. Errar não estoura: a linha do patrimônio sobe ou desce
 * numa forma plausível, e a comparação com o CDI — que é o que a tela existe para mostrar — mede
 * contra uma carteira que nunca existiu.
 */
const SHEET = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`
const HEADER = '<row><c r="D" t="inlineStr"><is><t>Código</t></is></c></row>'
const workbook = (sheets: number) => `<workbook><sheets>${Array.from({ length: sheets }, (_, n) => `<sheet name="Aba ${n + 1}" sheetId="${n + 1}"/>`).join('')}</sheets></workbook>`

const cell = (ref: string, value: string, text = false) => (text ? `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>` : `<c r="${ref}" ><v>${value}</v></c>`)

/** Posição de renda variável: código em D, quantidade em I, valor em N. */
const holding = (code: string, quantity: number, value: number) => `<row>${cell('D', code, true)}${cell('I', String(quantity))}${cell('N', String(value))}</row>`

/** Movimentação: A entrada/saída, B data, C tipo, D produto, F quantidade, G preço, H valor. */
const movement = (kind: 'Credito' | 'Debito', date: string, type: string, product: string, quantity: number, unit: number) =>
  `<row>${cell('A', kind, true)}${cell('B', date, true)}${cell('C', type, true)}${cell('D', product, true)}${cell('F', String(quantity))}${cell('G', String(unit))}${cell('H', String(quantity * unit))}</row>`

const position = (rows: string): SourceFile => ({
  path: 'docs/investimentos/posicao-2026-01-31.xlsx',
  bytes: xlsxOf({ 'xl/workbook.xml': workbook(3), 'xl/worksheets/sheet1.xml': SHEET(HEADER + rows), 'xl/worksheets/sheet2.xml': SHEET(HEADER), 'xl/worksheets/sheet3.xml': SHEET(HEADER) }),
})

const movements = (rows: string): SourceFile => ({
  path: 'docs/investimentos/movimentacao-2026-01-31.xlsx',
  bytes: xlsxOf({ 'xl/workbook.xml': workbook(1), 'xl/worksheets/sheet1.xml': SHEET(HEADER + rows) }),
})

const build = (pos: string, mov: string) => buildInvestments([position(pos), movements(mov)], browserEnv, [{ date: '2026-01-31', rate: 0.0005 }])

/**
 * O ÚLTIMO mês da série usa a posição relatada; os anteriores são RECONSTRUÍDOS.
 *
 * Foi o que meu primeiro fixture não alcançava: com movimentos só no mês da posição, a série tinha
 * um ponto só — e esse ponto vem pronto do relatório, não do cálculo. Quatro mutações passaram
 * ilesas por isso. Com a compra em novembro e a venda em dezembro, os dois meses anteriores saem
 * do `heldAt`, e é aí que o código de verdade roda.
 */
describe('a carteira é reconstruída a partir dos MOVIMENTOS', () => {
  const historia = [movement('Credito', '10/11/2025', 'Compra', 'PETR4 - PETROBRAS PN', 100, 30), movement('Debito', '20/12/2025', 'Venda', 'PETR4 - PETROBRAS PN', 40, 32)].join('')

  it('cada mês vale a quantidade DAQUELE mês, ao preço de entrada', async () => {
    // 100 papéis em novembro, 60 em dezembro depois da venda, e janeiro vem do relatório. Sem
    // subtrair a venda, dezembro apareceria com papéis que já não existiam — a linha subiria
    // onde ela de fato caiu.
    const report = await build(holding('PETR4', 60, 2400), historia)
    assert.ok(report)
    assert.deepEqual(
      report.series.map((point) => [point.month, point.equity]),
      [
        ['2025-11', 3000],
        ['2025-12', 1800],
        ['2026-01', 2400],
      ],
    )
  })

  it('e o último mês vem do RELATÓRIO, não da reconstrução', async () => {
    // É a cotação de hoje, que o relatório traz e o histórico não tem. Reconstruir o último mês
    // pelo preço de entrada apagaria todo o ganho ou perda de mercado.
    const report = await build(holding('PETR4', 60, 5000), historia)
    assert.ok(report)
    assert.equal(report.series.at(-1)?.equity, 5000)
    assert.equal(report.series[0].equity, 3000, 'e os anteriores continuam ao preço de entrada')
  })

  it('o PROVENTO não é custódia: ele não cria quantidade', async () => {
    // Dividendo e JCP movem dinheiro, não papel. Tratá-los como compra inventaria quantidade, e o
    // patrimônio cresceria sozinho a cada provento recebido.
    //
    // Medido: quem garante isso é a LISTA BRANCA `CUSTODY`, não o descarte explícito de `CASH`.
    // Removido o descarte, nada muda — "dividendo" continua fora da lista branca. É a sexta
    // guarda redundante desta sessão.
    const comDividendo = `${historia}<row>${cell('A', 'Credito', true)}${cell('B', '15/11/2025', true)}${cell('C', 'Dividendo', true)}${cell('D', 'PETR4 - PETROBRAS PN', true)}${cell('F', '50')}${cell('H', '123.45')}</row>`
    const report = await build(holding('PETR4', 60, 2400), comDividendo)
    assert.ok(report)
    assert.equal(report.series[0].equity, 3000, 'novembro continua com cem papéis, não cento e cinquenta')
  })

  it('e vender mais do que se comprou não deixa a quantidade NEGATIVA', async () => {
    // O relatório de movimentação é uma janela: a compra pode estar num arquivo antigo que você
    // não tem mais e a venda no atual. Sem a trava em zero o patrimônio daquele mês fica
    // negativo, e a linha atravessa o eixo para baixo.
    const report = await build(
      holding('PETR4', 0, 0),
      [movement('Credito', '10/11/2025', 'Compra', 'PETR4 - PETROBRAS PN', 40, 30), movement('Debito', '20/12/2025', 'Venda', 'PETR4 - PETROBRAS PN', 100, 32)].join(''),
    )
    assert.ok(report)
    assert.deepEqual(
      report.series.map((point) => point.equity),
      [1200, 0, 0],
      'dezembro trava em zero em vez de ir a −1800',
    )
    // Aqui a falsificação achou algo mais interessante que uma guarda redundante: DUAS guardas
    // que se protegem. O `Math.max(0, …)` do `heldAt` e o `if (q <= 0) continue` do laço da série
    // fazem, cada uma sozinha, o trabalho inteiro — removida uma, a outra segura, e a mutação
    // passa. Removidas AS DUAS, este teste fica vermelho (conferido). O comportamento é real e
    // está preso; o que não dá para atribuir é a QUAL das duas linhas ele pertence.
  })
})

/**
 * Os proventos NÃO vêm daqui — eles vêm do razão da corretora (`incomeByMonth`), que tem teste
 * próprio em `brokerage.test.ts`. Escrevi dois testes de dividendo aqui antes de conferir, e eles
 * mediam o lugar errado: sem o `extrato_de_conta.xlsx` não há razão, e `income` sai vazio.
 * Ficou o que de fato só se exercita por este caminho.
 */
describe('a renda fixa precisa do CDI para ter série', () => {
  it('um CDB reconstrói valor a partir do preço de emissão', async () => {
    // Renda fixa não tem cotação diária: o valor de cada mês sai do valor de emissão composto
    // pelo CDI, com o percentual RESOLVIDO para bater com a posição de hoje. Sem isso a linha do
    // patrimônio ficaria plana até o último mês e daria um salto no fim.
    const report = await build(`<row>${cell('D', 'CDB012345678', true)}${cell('I', '1')}${cell('N', '1050')}</row>`, movement('Credito', '10/01/2026', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000))
    assert.ok(report)
    assert.ok(report.series.length > 0, 'a renda fixa entra na série')
    assert.ok(
      report.series.every((point) => Number.isFinite(point.total)),
      'nenhum ponto vira NaN',
    )
  })

  it('e vender mais do que se comprou não deixa a quantidade NEGATIVA', async () => {
    // O relatório de movimentação é uma janela: a compra pode estar num arquivo antigo que você
    // não tem mais, e a venda no atual. Sem a trava em zero, a quantidade fica negativa, o
    // patrimônio daquele mês fica negativo, e a linha atravessa o eixo para baixo.
    const report = await build(
      holding('PETR4', 0, 0),
      [movement('Credito', '10/01/2026', 'Compra', 'PETR4 - PETROBRAS PN', 40, 30), movement('Debito', '20/01/2026', 'Venda', 'PETR4 - PETROBRAS PN', 100, 32)].join(''),
    )
    assert.ok(report)
    assert.ok(
      report.series.every((point) => point.equity >= 0),
      'nenhum mês com patrimônio negativo',
    )
  })
})

describe('o relatório sabe dizer quando não dá para reconstruir', () => {
  it('sem CDI em cache, a renda fixa não tem série e o problema é declarado', async () => {
    // E a renda fixa cai para o PRINCIPAL em vez de virar NaN. Medido: o ternário `cdi.length ?`
    // é REDUNDANTE — `factor([], …)` devolve 1, porque o laço não executa, e `q * unitBase * 1` é
    // o mesmo principal. A queda acontece com ou sem ele. O que este teste prende é o RESULTADO,
    // que é o que importa: nenhum ponto vira NaN e o principal aparece.
    const report = await buildInvestments(
      [position(`<row>${cell('D', 'CDB012345678', true)}${cell('I', '1')}${cell('N', '1050')}</row>`), movements(movement('Credito', '10/11/2025', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000))],
      browserEnv,
      [],
    )
    assert.ok(report)
    assert.ok(report.problems.some((p) => p.includes('CDI')))
    assert.ok(
      report.series.every((point) => Number.isFinite(point.total)),
      'nenhum ponto vira NaN',
    )
    assert.equal(report.series[0].fixedIncome, 1000, 'sem régua, vale o principal')
  })

  it('e sem os DOIS relatórios não há o que reconstruir', async () => {
    assert.equal(await buildInvestments([position(holding('PETR4', 100, 4000))], browserEnv, []), null)
  })
})
