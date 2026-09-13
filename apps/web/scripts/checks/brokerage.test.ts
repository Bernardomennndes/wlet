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
