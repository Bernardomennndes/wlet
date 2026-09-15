import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type BrokerageEntry, type BrokerageLedger, cashAt, contributionsByDate, incomeByMonth, readBrokerageLedger } from '@wlet/ingest/brokerage'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { xlsxOf } from './support/xlsx-fixture'

/**
 * O razão da corretora — de onde saem o aportado, o caixa e os proventos do Patrimônio.
 *
 * As três leituras que ele alimenta são as que a tela compara entre si: o "Aportado" é a régua
 * contra a qual o patrimônio se mede, e o rendimento é a diferença entre os dois. Classificar um
 * lançamento errado não estoura — move a régua, e o rendimento inteiro sai errado junto.
 */
const entry = (date: string, description: string, value: number, kind: BrokerageEntry['kind']): BrokerageEntry => ({ date, description, value, kind })
const ledgerOf = (entries: BrokerageEntry[]): BrokerageLedger => ({ entries, cash: 0, source: [], problems: [] })

describe('contributionsByDate', () => {
  it('só `bank` conta — o resto move dinheiro DENTRO da corretora', () => {
    // Somar compra, imposto ou provento aqui contaria o mesmo real duas vezes: ele já entrou
    // como aporte quando veio do banco. O aportado é a régua do rendimento, então inflá-lo faz
    // o rendimento aparecer menor do que foi.
    const out = contributionsByDate(
      ledgerOf([
        entry('2026-01-05', 'TED BCO 001 - RECEBIMENTO DE TED', 1000, 'bank'),
        entry('2026-01-06', 'COMPRA CDB', -800, 'asset'),
        entry('2026-01-07', 'DIVIDENDOS DE PETR4', 50, 'income'),
        entry('2026-01-08', 'IRRF', -7.5, 'tax'),
      ]),
    )
    assert.deepEqual([...out], [['2026-01-05', 1000]])
  })

  it('entradas e saídas do MESMO dia se somam, e o aporte é líquido', () => {
    const out = contributionsByDate(ledgerOf([entry('2026-01-05', 'RECEBIMENTO DE TED', 1000, 'bank'), entry('2026-01-05', 'RETIRADA EM C/C', -300, 'bank')]))
    assert.deepEqual([...out], [['2026-01-05', 700]])
  })
})

describe('cashAt', () => {
  it('é a soma corrida até a data, inclusive', () => {
    const ledger = ledgerOf([entry('2026-01-05', 'a', 1000, 'bank'), entry('2026-01-10', 'b', -400, 'asset'), entry('2026-02-01', 'c', 50, 'income')])
    assert.equal(cashAt(ledger, '2026-01-05'), 1000)
    assert.equal(cashAt(ledger, '2026-01-10'), 600)
    assert.equal(cashAt(ledger, '2026-02-01'), 650)
  })

  it('não depende da ORDEM dentro do dia — o extrato não a define', () => {
    // Vários lançamentos com a mesma data e saldos que só fazem sentido numa sequência que o
    // arquivo não declara. A soma é o que sobrevive a isso.
    const a = cashAt(ledgerOf([entry('2026-01-05', 'x', 1000, 'bank'), entry('2026-01-05', 'y', -400, 'asset')]), '2026-01-05')
    const b = cashAt(ledgerOf([entry('2026-01-05', 'y', -400, 'asset'), entry('2026-01-05', 'x', 1000, 'bank')]), '2026-01-05')
    assert.equal(a, b)
  })

  it('arredonda a centavo: a soma de float não pode vazar para a tela', () => {
    assert.equal(cashAt(ledgerOf([entry('2026-01-05', 'a', 0.1, 'bank'), entry('2026-01-05', 'b', 0.2, 'bank')]), '2026-01-05'), 0.3)
  })
})

describe('incomeByMonth', () => {
  it('separa dividendo, JCP e rendimento — três tributações diferentes', () => {
    // Dividendo é isento na pessoa física, JCP tem 15% retido na fonte, e rendimento de renda
    // fixa segue a tabela regressiva. Somá-los num número só esconde qual parte da renda é
    // líquida — e é essa a pergunta que o cartão responde.
    const [janeiro] = incomeByMonth(
      ledgerOf([
        entry('2026-01-05', 'DIVIDENDOS DE PETR4', 100, 'income'),
        entry('2026-01-10', 'JUROS S/ CAPITAL TAEE4', 80, 'income'),
        entry('2026-01-20', 'RENDIMENTO CDB', 40, 'income'),
        entry('2026-01-25', 'COMPRA CDB', -500, 'asset'),
      ]),
    )
    assert.deepEqual(janeiro, { month: '2026-01', dividends: 100, jcp: 80, yields: 40, total: 220 })
  })

  it('o cashback da corretora entra em RENDIMENTO, e não fica de fora', () => {
    // Não é provento de papel, mas é dinheiro que apareceu no caixa sem aporte. Deixá-lo de
    // fora faria a soma dos três não bater com o que entrou.
    const [mes] = incomeByMonth(ledgerOf([entry('2026-01-05', 'Investback', 12.34, 'income')]))
    assert.equal(mes.yields, 12.34)
    assert.equal(mes.total, 12.34)
  })
})

// ---------------------------------------------------------------------------
// A classificação, pela planilha — o defeito que o módulo registra ter tido
// ---------------------------------------------------------------------------

const row = (serial: number, description: string, value: number, balance = 0) =>
  `<row><c r="B" ><v>${serial}</v></c><c r="D" t="inlineStr"><is><t>${description}</t></is></c><c r="E" ><v>${value}</v></c><c r="G" ><v>${balance}</v></c></row>`

const SERIAL_2026_01_05 = 46027 // 05/01/2026 contando de 30/12/1899

const statement = (rows: string[]): SourceFile => ({
  path: 'docs/investimentos/extrato_de_conta.xlsx',
  bytes: xlsxOf({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Extrato" sheetId="1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
  }),
})

describe('readBrokerageLedger', () => {
  it('reconhece as DUAS famílias de transferência com o próprio banco', async () => {
    // A corretora registra a mesma transferência de dois jeitos conforme o canal: "conta
    // digital" quando é interna, e TED nominal quando passa pelo SPB. Reconhecer só a primeira
    // "escondeu R$ 11.800 de aporte e R$ 12.400,00 de resgate" — o aportado saiu baixo e o
    // rendimento apareceu NEGATIVO.
    const ledger = await readBrokerageLedger(
      [statement([row(SERIAL_2026_01_05, 'TRANSFERENCIA CONTA DIGITAL', 1000), row(SERIAL_2026_01_05 + 1, 'TED BCO 001 XP - RECEBIMENTO DE TED', 2000)])],
      browserEnv,
    )
    assert.ok(ledger)
    assert.deepEqual(
      ledger.entries.map((e) => e.kind),
      ['bank', 'bank'],
      'as duas formas são aporte',
    )
  })

  it('TED para TERCEIRO não é aporte — é outra titularidade', async () => {
    const ledger = await readBrokerageLedger([statement([row(SERIAL_2026_01_05, 'TED TER BCO 001 XP - RETIRADA EM C/C', -500)])], browserEnv)
    assert.ok(ledger)
    assert.notEqual(ledger.entries[0].kind, 'bank', 'dinheiro saindo para outra pessoa não conta como resgate seu')
  })

  it('cabeçalho e rodapé não viram lançamento', async () => {
    // Eles também têm texto na coluna B. Só linha com data serial plausível e valor é
    // lançamento — sem isso, o razão ganharia linhas fantasma e a trava aritmética acusaria
    // um desencontro que não existe.
    const ledger = await readBrokerageLedger([statement([row(1, 'Extrato de conta', 0), row(SERIAL_2026_01_05, 'COMPRA CDB', -800)])], browserEnv)
    assert.ok(ledger)
    assert.equal(ledger.entries.length, 1)
    assert.equal(ledger.entries[0].kind, 'asset')
  })

  it('o mesmo lançamento em dois arquivos com período sobreposto entra UMA vez', async () => {
    // Os períodos se sobrepõem em um dia entre arquivos exportados em sequência.
    const um = row(SERIAL_2026_01_05, 'COMPRA CDB', -800, 200)
    const ledger = await readBrokerageLedger([statement([um]), statement([um])], browserEnv)
    assert.ok(ledger)
    assert.equal(ledger.entries.length, 1)
  })

  it('sem arquivo da corretora devolve null, e não um razão vazio', async () => {
    // `null` é "não há extrato"; um razão vazio seria "a carteira é zero", e a tela mostraria
    // patrimônio zerado em vez de dizer que falta o arquivo.
    assert.equal(await readBrokerageLedger([{ path: 'docs/extrato/banco/janeiro.ofx', bytes: new Uint8Array() }], browserEnv), null)
  })

  it('a soma que não fecha com o saldo declarado vira PROBLEMA, não silêncio', async () => {
    const ledger = await readBrokerageLedger([statement([row(SERIAL_2026_01_05, 'COMPRA CDB', -800)])], browserEnv)
    assert.ok(ledger)
    assert.ok(ledger.problems.length >= 1, 'o extrato sem saldo declarado precisa avisar que a soma não pôde ser conferida')
  })
})

/**
 * A TRAVA ARITMÉTICA e as duas formas que a planilha assume.
 *
 * O docblock do módulo resume a premissa inteira: "a conferência é aritmética e não depende de
 * ordem — a soma de TODO lançamento desde o primeiro é igual ao saldo declarado hoje. Se não for, o
 * `problems` avisa e o número não deve ser publicado". O medidor mostrou que o lado que AVISA quase
 * nunca rodava, e que o caso em que a soma FECHA nunca rodou: o único teste do assunto afirmava
 * `problems.length >= 1` sobre um extrato sem saldo declarado, o que passa por qualquer motivo.
 */
const balanceHeader = (value: number) => `<row><c r="B" t="inlineStr"><is><t>Saldo total projetado</t></is></c><c r="C" ><v>${value}</v></c></row>`

/** A mesma linha, com o valor na coluna F em vez da E. A XP alterna entre as duas por arquivo. */
const rowF = (serial: number, description: string, value: number, balance = 0) =>
  `<row><c r="B" ><v>${serial}</v></c><c r="D" t="inlineStr"><is><t>${description}</t></is></c><c r="F" ><v>${value}</v></c><c r="G" ><v>${balance}</v></c></row>`

const statementAt = (path: string, rows: string[]): SourceFile => ({
  path,
  bytes: xlsxOf({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Extrato" sheetId="1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
  }),
})

describe('a soma do razão contra o saldo declarado', () => {
  it('quando FECHA, não há problema nenhum — e é este o caso que faltava', async () => {
    // Sem ele, todo teste do assunto poderia estar passando por um motivo qualquer: um extrato que
    // o leitor não entende produz zero lançamentos, soma zero, e "não fecha" do mesmo jeito.
    const ledger = await readBrokerageLedger(
      [statement([balanceHeader(200), row(SERIAL_2026_01_05, 'TED BCO 001 XP - RECEBIMENTO DE TED', 1000), row(SERIAL_2026_01_05 + 1, 'COMPRA CDB', -800)])],
      browserEnv,
    )

    assert.ok(ledger)
    assert.equal(ledger.cash, 200)
    assert.deepEqual(ledger.problems, [])
  })

  it('quando NÃO fecha, o aviso traz os DOIS números e diz onde procurar', async () => {
    // "Falta arquivo em docs/investimentos/" é a causa real: os extratos da XP saem por período, e
    // um buraco no meio some com lançamentos sem que nada mais denuncie. O aviso precisa dos dois
    // números porque a diferença entre eles é o que a pessoa vai caçar.
    const ledger = await readBrokerageLedger([statement([balanceHeader(5000), row(SERIAL_2026_01_05, 'TED BCO 001 XP - RECEBIMENTO DE TED', 1000)])], browserEnv)

    assert.ok(ledger)
    assert.equal(ledger.problems.length, 1)
    assert.match(ledger.problems[0], /1000\.00.*5000\.00/, 'a soma e o declarado')
    assert.match(ledger.problems[0], /docs\/investimentos/)
  })

  it('e sem saldo declarado o aviso é OUTRO — não se confunde com a soma errada', async () => {
    // O teste que já existia afirmava só `problems.length >= 1`, e por isso não separava os dois
    // casos. São diagnósticos diferentes: um diz "falta arquivo", o outro diz "não deu para
    // conferir", e quem lê precisa saber qual dos dois.
    const ledger = await readBrokerageLedger([statement([row(SERIAL_2026_01_05, 'COMPRA CDB', -800)])], browserEnv)

    assert.ok(ledger)
    assert.equal(ledger.problems.length, 1)
    assert.match(ledger.problems[0], /não pôde ser conferida/)
    assert.doesNotMatch(ledger.problems[0], /não fecha/)
  })
})

describe('a coluna do valor alterna entre E e F conforme o arquivo', () => {
  it('a planilha que escreve em F é lida igual', async () => {
    // Lendo só a E, todo arquivo do outro formato produziria ZERO lançamentos — e o razão não
    // fecharia por um motivo que o aviso não sabe explicar, porque ele fala em arquivo faltando.
    const ledger = await readBrokerageLedger(
      [statementAt('docs/investimentos/extrato_de_conta_2026.xlsx', [balanceHeader(1000), rowF(SERIAL_2026_01_05, 'TED BCO 001 XP - RECEBIMENTO DE TED', 1000)])],
      browserEnv,
    )

    assert.ok(ledger)
    assert.deepEqual(
      ledger.entries.map((e) => [e.description, e.value, e.kind]),
      [['TED BCO 001 XP - RECEBIMENTO DE TED', 1000, 'bank']],
    )
    assert.deepEqual(ledger.problems, [])
  })
})

describe('a ordem dos arquivos é do NOME, não da máquina de quem abre', () => {
  it('o saldo declarado sai do primeiro nome em ordem, mesmo chegando por último', async () => {
    // O módulo registra por que isto não é cosmético: `declared` fica com o saldo do PRIMEIRO
    // arquivo da lista, e é ele que decide a trava aritmética. Sem a ordenação por NOME, a
    // conferência passaria ou falharia conforme a ordem em que o sistema de arquivos devolveu a
    // pasta — e o mesmo `docs/` daria respostas diferentes em duas máquinas.
    //
    // Os caminhos são escolhidos para que NOME e CAMINHO discordem: por nome de arquivo,
    // `extrato_de_a` vem primeiro; por caminho inteiro, a pasta `a/` viria antes da `z/`. Só a
    // comparação por BASENAME dá o resultado abaixo, e os saldos declarados diferem de propósito —
    // só o do `extrato_de_a` fecha com a soma.
    const porNome = statementAt('docs/investimentos/z/extrato_de_a.xlsx', [balanceHeader(1000), row(SERIAL_2026_01_05, 'TED BCO 001 XP - RECEBIMENTO DE TED', 1000)])
    const porCaminho = statementAt('docs/investimentos/a/extrato_de_b.xlsx', [balanceHeader(9999)])

    const ledger = await readBrokerageLedger([porCaminho, porNome], browserEnv)
    assert.ok(ledger)
    assert.deepEqual(ledger.problems, [], 'vence o `extrato_de_a`, cujo saldo fecha — apesar de a PASTA dele vir depois')
  })
})

describe('o que a classificação decide, lida da planilha', () => {
  it('imposto e provento saem do texto, e não do sinal do valor', async () => {
    // Os dois são negativos e positivos respectivamente, mas não é isso que os separa — um resgate
    // também é negativo. Classificar pelo sinal poria o IR na régua do aportado, e o rendimento
    // apareceria menor do que foi.
    const ledger = await readBrokerageLedger(
      [statement([balanceHeader(42.5), row(SERIAL_2026_01_05, 'IRRF SOBRE RENDIMENTOS', -7.5), row(SERIAL_2026_01_05 + 1, 'JUROS S/ CAPITAL PROPRIO PETR4', 50)])],
      browserEnv,
    )

    assert.ok(ledger)
    assert.deepEqual(
      ledger.entries.map((e) => e.kind),
      ['tax', 'income'],
    )
  })

  it('dois lançamentos IGUAIS no mesmo dia com saldos diferentes são dois', async () => {
    // O saldo corrente entra na chave de deduplicação de propósito: duas compras idênticas no mesmo
    // dia são legítimas, e sem a coluna `G` a segunda seria descartada como repetição de arquivo
    // sobreposto. O caixa perderia o valor dela e o razão deixaria de fechar.
    const ledger = await readBrokerageLedger([statement([balanceHeader(-1600), row(SERIAL_2026_01_05, 'COMPRA CDB', -800, 100), row(SERIAL_2026_01_05, 'COMPRA CDB', -800, 200)])], browserEnv)

    assert.ok(ledger)
    assert.equal(ledger.entries.length, 2)
    assert.deepEqual(ledger.problems, [])
  })
})
