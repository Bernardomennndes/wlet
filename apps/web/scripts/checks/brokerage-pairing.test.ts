import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'
import { xlsxOf } from './support/xlsx-fixture'

/**
 * O RESGATE que volta da corretora sem dizer que veio dela — o último bloco do pipeline sem teste.
 *
 * A corretora devolve dinheiro para a conta corrente por dois canais, e só um se identifica: o
 * interno chega como "Transferência recebida da conta investimento"; o SPB chega como uma TED
 * nominal do PRÓPRIO TITULAR, indistinguível de um Pix que você mandou de outro banco seu.
 *
 * Quem desempata é o razão da corretora, que registra a saída correspondente. Sem esse
 * cruzamento, o resgate entra como RECEITA: o mês ganha uma entrada que não existiu, e o
 * patrimônio é contado duas vezes — uma no caixa da corretora e outra na conta.
 */
const SERIAL_05_01 = 46_027 // 05/01/2026, contando de 30/12/1899

const entry = (serial: number, description: string, value: number, balance = 0) =>
  `<row><c r="B" ><v>${serial}</v></c><c r="D" t="inlineStr"><is><t>${description}</t></is></c><c r="E" ><v>${value}</v></c><c r="G" ><v>${balance}</v></c></row>`

const ledger = (rows: string[]): SourceFile => ({
  path: 'docs/investimentos/extrato_de_conta.xlsx',
  bytes: xlsxOf({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Extrato" sheetId="1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
  }),
})

const OFX = (date: string, amount: string, memo: string) => `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001</BANKID><ACCTID>111</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
<STMTTRN><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${date}${amount}</FITID><MEMO>${memo}</MEMO></STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>0.00</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const CONTA: AccountProfile = { id: 'corrente', name: 'Corrente', bank: 'Banco', bankCode: '001', type: 'checking', entity: 'PF', holder: 'Fulano', match: { externalId: '111' } }
const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }

const run = (extrato: SourceFile, ledgerFile: SourceFile | null) =>
  runIngest({
    sources: ledgerFile ? [extrato, ledgerFile] : [extrato],
    accounts: [CONTA],
    // O nome próprio é o que faz a TED nominal parecer transferência sua — sem ele ela nem é
    // candidata, e o cruzamento com o razão nunca acontece.
    selfNamePatterns: [/FULANO DE TAL/i],
    rules: buildRules(),
    planned: [],
    receivables: [],
    budget,
    goals: [],
    now: '2026-02-01T00:00:00.000Z',
    env: browserEnv,
  } as IngestInput)

const withdrawal = (date = '20260105', amount = '1000.00') => ({ path: 'docs/extrato/a/janeiro.ofx', bytes: new TextEncoder().encode(OFX(date, amount, 'TED RECEBIDA FULANO DE TAL')) }) as SourceFile

describe('o resgate se reconhece pelo razão da corretora', () => {
  it('uma retirada no razão casa com a entrada no banco', async () => {
    // O cruzamento que este bloco existe para fazer. Sem ele a entrada vira RECEITA: o mês ganha
    // dinheiro que não entrou de fora, e o patrimônio aparece duas vezes.
    const result = await run(withdrawal(), ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -1000)]))
    assert.equal(result.transfers.length, 1)
    assert.equal(result.transfers[0].kind, 'investment')
    assert.equal(result.transfers[0].fromAccountId, 'xp-investimentos')
    assert.equal(result.transactions[0].transferKind, 'investment')
    assert.equal(result.transactions[0].categoryId, 'transferencia')
  })

  it('sem o razão, a mesma entrada fica SEM CONTRAPARTE — e não vira receita', async () => {
    // O comportamento sem o arquivo da corretora: ela parece transferência própria e não achou o
    // outro lado. Fica dito na tela, em vez de somar como entrada.
    const result = await run(withdrawal(), null)
    assert.equal(result.transfers.length, 0)
    assert.equal(result.transactions[0].transferKind, 'unmatched-self')
  })

  it('valor diferente não casa', async () => {
    const result = await run(withdrawal(), ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -999)]))
    assert.equal(result.transfers.length, 0)
  })

  it('e a janela é de QUATRO dias, como a do pareamento entre contas', async () => {
    // Casar só por valor juntaria um resgate a um Pix seu de outro banco na mesma quantia.
    const inside = await run(withdrawal('20260109'), ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -1000)]))
    assert.equal(inside.transfers.length, 1)

    const outside = await run(withdrawal('20260110'), ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -1000)]))
    assert.equal(outside.transfers.length, 0)
  })

  it('e uma retirada só casa com UM resgate', async () => {
    // `used` marca a retirada consumida. Sem isso, dois resgates do mesmo valor casariam com a
    // mesma linha do razão, e o segundo viraria transferência que não houve.
    const twice = {
      path: 'docs/extrato/a/janeiro.ofx',
      bytes: new TextEncoder().encode(
        OFX('20260105', '1000.00', 'TED RECEBIDA FULANO DE TAL').replace(
          '</BANKTRANLIST>',
          '<STMTTRN><DTPOSTED>20260106</DTPOSTED><TRNAMT>1000.00</TRNAMT><FITID>b</FITID><MEMO>TED RECEBIDA FULANO DE TAL</MEMO></STMTTRN></BANKTRANLIST>',
        ),
      ),
    } as SourceFile
    const result = await run(twice, ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -1000)]))
    assert.equal(result.transfers.length, 1, 'uma retirada, um resgate')
  })
})

describe('o que NÃO é resgate fica de fora', () => {
  it('entrada que não cita você não é candidata', async () => {
    // Um Pix de cliente no mesmo valor e no mesmo dia não pode virar resgate: isso apagaria uma
    // receita de verdade do mês.
    const cliente = { path: 'docs/extrato/a/janeiro.ofx', bytes: new TextEncoder().encode(OFX('20260105', '1000.00', 'PIX RECEBIDO DE CLIENTE LTDA')) } as SourceFile
    const result = await run(cliente, ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RETIRADA EM C/C', -1000)]))
    assert.equal(result.transfers.length, 0)
    assert.notEqual(result.transactions[0].categoryId, 'transferencia')
  })

  it('e um APORTE no razão não casa com entrada nenhuma', async () => {
    // Só a saída do caixa da corretora é resgate. Uma entrada lá é dinheiro indo, não voltando.
    //
    // Fica dito o que a mutação mostrou: o filtro `value < 0` da fonte é REDUNDANTE. Removido,
    // nada muda — a lista guarda `-value`, então um aporte de +1000 entraria como −1000, e o
    // casamento compara com o valor POSITIVO da entrada no banco (o laço já pula `tx.amount <= 0`).
    // A diferença dá 2000 e nunca cabe na tolerância de um centavo. É a quarta guarda desta
    // sessão que a falsificação identifica como não-observável; ela documenta a intenção, e o
    // que de fato exclui o aporte é a aritmética de sinal.
    const result = await run(withdrawal(), ledger([entry(SERIAL_05_01, 'TED BCO 001 XP - RECEBIMENTO DE TED', 1000)]))
    assert.equal(result.transfers.length, 0)
  })
})
