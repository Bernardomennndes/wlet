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

/**
 * QUANDO O RAZÃO DA CORRETORA ESTÁ PRESENTE — o lado que o fixture nunca alcançava.
 *
 * Todos os testes acima montam só os dois relatórios da B3. Sem `extrato_de_*.xlsx` na lista, o
 * `readBrokerageLedger` devolve `null` sempre, e dois caminhos deste módulo nunca rodavam: o
 * aportado sair do razão, e os problemas DELE subirem para o relatório de investimentos.
 *
 * Os dois importam pela mesma razão. O "Aportado" é a RÉGUA contra a qual o patrimônio se mede —
 * o rendimento é a diferença entre os dois —, então um aportado vazio faz a tela mostrar o
 * patrimônio inteiro como ganho. E um razão que não fecha, se o aviso dele não subir, publica esse
 * número com uma inconsistência conhecida e escondida uma camada abaixo.
 */
const brokerageRow = (serial: number, description: string, value: number) =>
  `<row><c r="B" ><v>${serial}</v></c><c r="D" t="inlineStr"><is><t>${description}</t></is></c><c r="E" ><v>${value}</v></c><c r="G" ><v>0</v></c></row>`

const brokerageHeader = (balance: number) => `<row><c r="B" t="inlineStr"><is><t>Saldo total projetado</t></is></c><c r="C" ><v>${balance}</v></c></row>`

const ledgerFile = (rows: string, path = 'docs/investimentos/extrato_de_conta.xlsx'): SourceFile => ({
  path,
  bytes: xlsxOf({ 'xl/workbook.xml': '<workbook><sheets><sheet name="Extrato" sheetId="1"/></sheets></workbook>', 'xl/worksheets/sheet1.xml': SHEET(rows) }),
})

/** 10/11/2025, contando de 30/12/1899 — o dia da compra dos testes acima. */
const SERIAL_2025_11_10 = 45971

describe('o razão da corretora, quando está lá', () => {
  const historia = movement('Credito', '10/11/2025', 'Compra', 'PETR4 - PETROBRAS PN', 100, 30)

  it('o APORTADO sai dele, e não de um mapa vazio', async () => {
    // Sem esta leitura o "Aportado" é zero e o rendimento vira o patrimônio inteiro. É o número
    // mais fácil de olhar e não questionar, porque ele aparece grande e positivo.
    const report = await buildInvestments(
      [position(holding('PETR4', 100, 3000)), movements(historia), ledgerFile(brokerageHeader(3000) + brokerageRow(SERIAL_2025_11_10, 'TED BCO 001 XP - RECEBIMENTO DE TED', 3000))],
      browserEnv,
      [{ date: '2026-01-31', rate: 0.0005 }],
    )

    assert.ok(report)
    assert.deepEqual(report.problems, [], 'o razão fecha: nada a declarar')
    assert.ok(
      report.series.some((point) => point.contributed > 0),
      'o aportado chegou à série',
    )
  })

  it('e os problemas DELE sobem para o relatório de investimentos', async () => {
    // O razão declara R$ 9.999 e a soma dá R$ 3.000. O aviso nasce em `brokerage.ts` e precisa
    // atravessar: quem olha a tela de Patrimônio não abre o relatório do razão, e um número
    // publicado com inconsistência conhecida é pior que um número ausente.
    const report = await buildInvestments(
      [position(holding('PETR4', 100, 3000)), movements(historia), ledgerFile(brokerageHeader(9999) + brokerageRow(SERIAL_2025_11_10, 'TED BCO 001 XP - RECEBIMENTO DE TED', 3000))],
      browserEnv,
      [{ date: '2026-01-31', rate: 0.0005 }],
    )

    assert.ok(report)
    assert.equal(report.problems.length, 1)
    assert.match(report.problems[0], /não fecha/)
  })

  it('e o relatório MAIS RECENTE vence, pelo nome do arquivo', async () => {
    // Mesma disciplina de `brokerage.ts`: a ordem é de unidade de código sobre o BASENAME, nunca o
    // caminho nem `localeCompare`. Aqui ela decide qual posição é "hoje" — e a posição de hoje é o
    // último ponto da série, o único que não é reconstruído.
    const antiga = { ...position(holding('PETR4', 50, 1500)), path: 'docs/investimentos/z/posicao-2025-12-31.xlsx' }
    const nova = { ...position(holding('PETR4', 100, 3000)), path: 'docs/investimentos/a/posicao-2026-01-31.xlsx' }

    const report = await buildInvestments([nova, antiga, movements(historia)], browserEnv, [{ date: '2026-01-31', rate: 0.0005 }])
    assert.ok(report)
    assert.equal(report.series.at(-1)?.month, '2026-01', 'vence a posição de janeiro, apesar de a PASTA dela vir antes')
  })
})

/**
 * A RENDA FIXA não tem cotação: o valor de cada mês é DERIVADO, e a derivação pode não fechar.
 *
 * Um papel de renda fixa vale o preço de emissão composto pelo CDI, a um percentual que o módulo
 * RESOLVE por bisseção para bater com a posição de hoje. É uma conta que inventa um número — e o
 * módulo sabe disso: depois de resolver, ele confere se o percentual encontrado reproduz a posição,
 * e declara problema quando não reproduz.
 *
 * Esse ramo nunca rodava, e ele é o mesmo princípio da trava aritmética do razão: um número que não
 * se confere não deve ser publicado calado. A diferença é que aqui o número é PLAUSÍVEL — sai de
 * uma curva de juros de verdade, sobe suavemente, e só está errado.
 */
const positionAt = (path: string, rows: string): SourceFile => ({
  path,
  bytes: xlsxOf({ 'xl/workbook.xml': workbook(3), 'xl/worksheets/sheet1.xml': SHEET(HEADER + rows), 'xl/worksheets/sheet2.xml': SHEET(HEADER), 'xl/worksheets/sheet3.xml': SHEET(HEADER) }),
})

/**
 * A posição de RENDA FIXA vai na TERCEIRA aba, com o valor na coluna Q.
 *
 * A aba decide a espécie no RELATÓRIO, e o código do papel decide na RECONSTRUÇÃO — são dois
 * classificadores para a mesma coisa, e eles só concordam se o fixture puser o papel na aba certa.
 * Descobri isso medindo: com o CDB na aba 1, os meses reconstruídos vinham como renda fixa (o
 * `FIXED_INCOME_CODE` casa o código) e o último mês vinha como renda VARIÁVEL (a aba 1 é
 * `equity`), então `fixedIncome` do último mês era zero. Não é defeito do módulo; era o meu
 * fixture na aba errada.
 */
const fixedPositionAt = (path: string, code: string, quantity: number, value: number): SourceFile => ({
  path,
  bytes: xlsxOf({
    'xl/workbook.xml': workbook(3),
    'xl/worksheets/sheet1.xml': SHEET(HEADER),
    'xl/worksheets/sheet2.xml': SHEET(HEADER),
    'xl/worksheets/sheet3.xml': SHEET(`${HEADER}<row>${cell('D', code, true)}${cell('I', String(quantity))}${cell('Q', String(value))}</row>`),
  }),
})

describe('o %CDI derivado precisa REPRODUZIR a posição', () => {
  it('quando nenhuma taxa alcança o valor informado, o problema é declarado', async () => {
    // A posição diz R$ 5.000 sobre uma emissão de R$ 1.000, num único dia de CDI. Nem 250% do CDI
    // — o teto da bisseção — chega perto. O módulo não pode inventar o número: ele o entrega e
    // avisa, com os dois valores, porque a diferença entre eles é o que a pessoa vai investigar.
    const report = await buildInvestments(
      [
        positionAt('docs/investimentos/posicao-2026-01-31.xlsx', `<row>${cell('D', 'CDB012345678', true)}${cell('I', '1')}${cell('N', '5000')}</row>`),
        movements(movement('Credito', '30/01/2026', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000)),
      ],
      browserEnv,
      [{ date: '2026-01-31', rate: 0.0005 }],
    )

    assert.ok(report)
    const derivado = report.problems.find((p) => p.includes('CDB012345678'))
    assert.ok(derivado, 'o problema nomeia o papel')
    assert.match(derivado, /não reproduz a posição/)
    assert.match(derivado, /5000\.00/, 'e traz o valor informado, para a diferença ser visível')
  })

  it('e quando alcança, não há problema sobre o papel', async () => {
    // O controle. Sem ele, o teste acima passaria com um fixture que o leitor nem entende — zero
    // papéis também não produz problema de papel nenhum, por outro motivo.
    const report = await buildInvestments(
      [
        positionAt('docs/investimentos/posicao-2026-01-31.xlsx', `<row>${cell('D', 'CDB012345678', true)}${cell('I', '1')}${cell('N', '1000.5')}</row>`),
        movements(movement('Credito', '30/01/2026', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000)),
      ],
      browserEnv,
      [{ date: '2026-01-31', rate: 0.0005 }],
    )

    assert.ok(report)
    assert.deepEqual(
      report.problems.filter((p) => p.includes('não reproduz')),
      [],
    )
  })
})

/** Movimento em que o TOTAL não é quantidade × preço unitário — é o que acontece com custos embutidos. */
const movementWithFee = (date: string, product: string, quantity: number, unit: number, total: number) =>
  `<row>${cell('A', 'Credito', true)}${cell('B', date, true)}${cell('C', 'Aplicação', true)}${cell('D', product, true)}${cell('F', String(quantity))}${cell('G', String(unit))}${cell('H', String(total))}</row>`

describe('o preço unitário sai do TOTAL dividido pela quantidade', () => {
  it('e não da coluna de preço, que ignora custos embutidos', async () => {
    // O relatório traz as duas colunas, e elas discordam quando há custo no meio: 10 papéis a R$ 30
    // com R$ 50 de taxa saem com total de R$ 350. O preço que o patrimônio precisa é o EFETIVO —
    // R$ 35 —, porque é ele que saiu da conta. Usar a coluna de preço subestima a carteira toda, e
    // o rendimento aparece maior do que foi.
    //
    // A compra é em NOVEMBRO e a posição de janeiro: sem essa distância a série tem um ponto só, e
    // esse ponto vem pronto do relatório — foi assim que a primeira versão deste teste passou com o
    // defeito aplicado. É a mesma armadilha que o cabeçalho deste arquivo registra.
    const report = await buildInvestments(
      [positionAt('docs/investimentos/posicao-2026-01-31.xlsx', holding('PETR4', 10, 400)), movements(movementWithFee('10/11/2025', 'PETR4 - PETROBRAS PN', 10, 30, 350))],
      browserEnv,
      [{ date: '2026-01-31', rate: 0.0005 }],
    )

    assert.ok(report)
    const novembro = report.series.find((p) => p.month === '2025-11')
    assert.ok(novembro, 'a série alcança o mês da compra')
    assert.equal(novembro.equity, 350, 'dez papéis ao preço EFETIVO de 35, e não aos 30 da coluna')
  })
})

describe('a renda fixa não rende ALÉM do último dia com CDI', () => {
  it('com o cache do CDI mais velho que o relatório, os meses seguintes ficam PARADOS', async () => {
    // O caso real: `pnpm cdi` roda menos vezes que a exportação da corretora, então o cache termina
    // antes do relatório de posição. A série vai até o mês do relatório, mas a composição para no
    // último dia com CDI — os meses sem dado ficam no mesmo valor, em vez de subirem sozinhos.
    //
    // Uma subida suave e falsa é pior que um degrau: ela não convida a conferir.
    const report = await buildInvestments(
      [fixedPositionAt('docs/investimentos/posicao-2026-03-31.xlsx', 'CDB012345678', 1, 1000.5), movements(movement('Credito', '05/01/2026', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000))],
      browserEnv,
      [
        { date: '2026-01-05', rate: 0.0005 },
        { date: '2026-01-31', rate: 0.0005 },
      ],
    )

    assert.ok(report)
    const janeiro = report.series.find((p) => p.month === '2026-01')
    const fevereiro = report.series.find((p) => p.month === '2026-02')
    assert.ok(janeiro && fevereiro, 'a série alcança os meses sem CDI')
    assert.equal(fevereiro.fixedIncome, janeiro.fixedIncome, 'fevereiro não rende: não há CDI para compor')
  })
})

/**
 * O TÍTULO JÁ EXTINTO — o papel que foi comprado e resgatado DENTRO do histórico.
 *
 * Ele não está na posição de hoje, então não há valor de mercado para resolver o %CDI contra. O
 * módulo usa o valor de SAÍDA: o percentual sai do que o resgate pagou, não do que a carteira vale.
 *
 * Sem esse ramo, `pct` fica em 1 — cem por cento do CDI — e o papel é avaliado a uma taxa que não é
 * a dele em TODOS os meses em que existiu. Um CDB a 110% do CDI, resgatado no ano passado, aparece
 * valendo menos do que valia em cada ponto da série, e o patrimônio histórico fica baixo.
 *
 * O efeito na tela é o pior possível: a linha do passado desce, a de hoje não muda — e a diferença
 * entre as duas é justamente o RENDIMENTO, que passa a parecer maior do que foi.
 */
describe('o papel que não está mais na carteira', () => {
  it('tira o %CDI do valor de RESGATE, e não do valor de hoje', async () => {
    // Comprado em novembro por R$ 1.000, resgatado em janeiro por R$ 1.100 — dez por cento em dois
    // meses, muito acima do CDI do fixture. A posição de hoje não o contém.
    //
    // O que se afirma é o resultado observável do `pct` resolvido: com ele, o valor reconstruído de
    // dezembro fica ENTRE a compra e o resgate, compondo à taxa que o resgate revelou. Com `pct`
    // preso em 1, dezembro ficaria colado nos mil reais da emissão.
    const compra = movement('Credito', '10/11/2025', 'Aplicação', 'CDB012345678 - BANCO X', 1, 1000)
    const resgate = movement('Debito', '15/01/2026', 'Resgate Antecipado/', 'CDB012345678 - BANCO X', 1, 1100)
    const report = await buildInvestments([fixedPositionAt('docs/investimentos/posicao-2026-01-31.xlsx', 'OUTRO987654321', 1, 500), movements([compra, resgate].join(''))], browserEnv, [
      { date: '2025-11-10', rate: 0.0005 },
      { date: '2025-12-31', rate: 0.0005 },
      { date: '2026-01-15', rate: 0.0005 },
      { date: '2026-01-31', rate: 0.0005 },
    ])

    assert.ok(report)
    const dezembro = report.series.find((p) => p.month === '2025-12')
    assert.ok(dezembro, 'a série alcança o mês em que o papel ainda existia')
    //
    // O número é preso, e não um `> 1000`: com o ramo desligado dezembro dá 1000,50 — que também é
    // maior que mil. Escrevi assim primeiro e as duas mutações passaram. A diferença entre os dois
    // mundos é de setenta e cinco centavos aqui, e é ela que o teste precisa enxergar.
    //
    // O percentual resolvido satura no teto da bisseção (250% do CDI), porque dez por cento em dois
    // dias de CDI é inalcançável — o solver devolve o limite em vez de um número sem sentido, e o
    // problema declarado do bloco acima é quem avisa quando isso importa.
    assert.equal(dezembro.fixedIncome, 1001.25, 'compõe à taxa que o resgate revelou; sem o ramo daria 1000,50')
  })

  it('e o resgate mais RECENTE é o que manda, quando há mais de um', async () => {
    // A lista é ordenada e o `.at(-1)` pega o último. Dois resgates parciais são o caso de quem
    // tira o dinheiro em partes, e é o preço da ÚLTIMA saída que reflete a taxa acumulada até ali.
    //
    // **Os dois resgates precisam implicar taxas DIFERENTES, senão o teste não separa nada.** Com
    // os valores que escrevi primeiro — e com o CDI esparso do fixture — os dois solves saturavam
    // no mesmo teto, e trocar `.at(-1)` por `.at(0)` não mudava um centavo. O parcial aqui paga
    // pouco acima da emissão (taxa baixa) e o último paga dez por cento (taxa no teto).
    const compra = movement('Credito', '10/11/2025', 'Aplicação', 'CDB012345678 - BANCO X', 2, 1000)
    const parcial = movement('Debito', '10/12/2025', 'Resgate Antecipado/', 'CDB012345678 - BANCO X', 1, 1001)
    const ultimo = movement('Debito', '15/01/2026', 'Resgate Antecipado/', 'CDB012345678 - BANCO X', 1, 1100)
    const report = await buildInvestments([fixedPositionAt('docs/investimentos/posicao-2026-01-31.xlsx', 'OUTRO987654321', 1, 500), movements([compra, parcial, ultimo].join(''))], browserEnv, [
      { date: '2025-11-30', rate: 0.0005 },
      { date: '2025-12-05', rate: 0.0005 },
      { date: '2025-12-20', rate: 0.0005 },
      { date: '2026-01-10', rate: 0.0005 },
    ])

    assert.ok(report)
    const novembro = report.series.find((p) => p.month === '2025-11')
    const dezembro = report.series.find((p) => p.month === '2025-12')
    assert.ok(novembro && dezembro)
    assert.equal(novembro.fixedIncome, 2002.5, 'dois papéis, já compondo o dia de CDI que caiu depois da compra')
    // Dezembro é onde os dois resgates se separam: depois do parcial resta UM papel, e ele compõe
    // pela taxa que o ÚLTIMO resgate revelou.
    assert.equal(dezembro.fixedIncome, 1003.75, 'taxa do resgate de janeiro; pela do de dezembro daria 1001,50')
  })
})
