import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'

/**
 * O PAREAMENTO de transferências — 45% dos ramos do pipeline estavam sem teste, e este é o bloco
 * mais caro deles.
 *
 * Achado por medição, não por intuição: `--experimental-test-coverage` mostrou `pipeline.ts` com
 * 45,37% de ramos cobertos, o pior número do repositório. Este arquivo ataca o maior buraco.
 *
 * O que está em jogo é dinheiro contado duas vezes. Uma transferência entre contas suas não é
 * entrada nem saída — é o mesmo dinheiro mudando de bolso. Não pareada, ela vira uma despesa numa
 * conta e uma receita na outra: o mês infla os DOIS lados na mesma medida, o resultado continua
 * certo por acaso, e a tela diz que você movimentou o dobro do que movimentou.
 *
 * Pareada errado é pior: um pagamento de fatura casado com um Pix vira uma transferência que não
 * aconteceu, e a fatura some do gasto.
 */
const OFX = (transactions: string, acctId: string, bankId = '001') => `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO ${bankId}</ORG><FID>${bankId}</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>${bankId}</BANKID><ACCTID>${acctId}</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
${transactions}
</BANKTRANLIST><LEDGERBAL><BALAMT>1000.00</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const TRN = (date: string, amount: string, memo: string) =>
  `<STMTTRN><TRNTYPE>${Number(amount) > 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${date}-${amount}-${memo.slice(0, 6)}</FITID><MEMO>${memo}</MEMO></STMTTRN>`

const file = (path: string, text: string): SourceFile => ({ path, bytes: new TextEncoder().encode(text) })

const account = (id: string, over: Partial<AccountProfile> = {}): AccountProfile => ({
  id,
  name: id,
  bank: 'Banco',
  bankCode: '001',
  type: 'checking',
  entity: 'PF',
  holder: 'Fulano',
  match: { bankCode: '001' },
  ...over,
})

const CORRENTE = account('corrente', { match: { externalId: '111' } })
const POUPANCA = account('poupanca', { match: { externalId: '222' } })
const CARTAO = account('cartao', { type: 'credit-card', match: { externalId: '333' } })

const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }

const input = (sources: SourceFile[], accounts: AccountProfile[]): IngestInput => ({
  sources,
  accounts,
  // O NOME PRÓPRIO é o que faz o pipeline reconhecer a transferência: um lançamento entra no
  // pareamento se a categoria já é de transferência OU se a descrição cita você. Com a lista
  // vazia — como escrevi na primeira versão — nenhum candidato existe e nenhum par se forma.
  selfNamePatterns: [/FULANO DE TAL/i],
  rules: buildRules(),
  planned: [],
  receivables: [],
  budget,
  goals: [],
  now: '2026-02-01T00:00:00.000Z',
  env: browserEnv,
})

/** Duas contas, uma saída de um lado e uma entrada do outro. */
const twoSides = (saida: { date: string; amount: string; memo: string }, entrada: { date: string; amount: string; memo: string }, accounts = [CORRENTE, POUPANCA]) =>
  input(
    [file('docs/extrato/a/janeiro.ofx', OFX(TRN(saida.date, saida.amount, saida.memo), '111')), file('docs/extrato/b/janeiro.ofx', OFX(TRN(entrada.date, entrada.amount, entrada.memo), '222'))],
    accounts,
  )

describe('o mesmo dinheiro mudando de bolso vira UMA transferência', () => {
  it('saída e entrada de mesmo valor, em contas suas, se encontram', async () => {
    const result = await runIngest(twoSides({ date: '20260105', amount: '-500.00', memo: 'PIX ENVIADO FULANO DE TAL' }, { date: '20260105', amount: '500.00', memo: 'PIX RECEBIDO FULANO DE TAL' }))
    assert.equal(result.transfers.length, 1)
    assert.equal(result.transfers[0].amount, 500)
    // Os dois lançamentos continuam existindo — o que muda é que passam a saber que são um par.
    assert.equal(result.transactions.filter((t) => t.transferId).length, 2)
    assert.equal(result.transactions.filter((t) => t.transferKind === 'internal').length, 2)
  })

  it('a janela é de QUATRO dias: o que cai fora dela não pareia', async () => {
    // Bancos creditam em dias diferentes, então casar só no mesmo dia perderia metade dos pares.
    // Mas uma janela larga demais juntaria dois movimentos parecidos que nada têm a ver.
    const inside = await runIngest(twoSides({ date: '20260105', amount: '-500.00', memo: 'TED ENVIADA FULANO DE TAL' }, { date: '20260109', amount: '500.00', memo: 'TED RECEBIDA FULANO DE TAL' }))
    assert.equal(inside.transfers.length, 1)

    const outside = await runIngest(twoSides({ date: '20260105', amount: '-500.00', memo: 'TED ENVIADA FULANO DE TAL' }, { date: '20260110', amount: '500.00', memo: 'TED RECEBIDA FULANO DE TAL' }))
    assert.equal(outside.transfers.length, 0, 'cinco dias já é outro movimento')
  })

  it('valor diferente não pareia, nem por um centavo', async () => {
    const result = await runIngest(twoSides({ date: '20260105', amount: '-500.00', memo: 'TED ENVIADA FULANO DE TAL' }, { date: '20260105', amount: '499.99', memo: 'TED RECEBIDA FULANO DE TAL' }))
    assert.equal(result.transfers.length, 0)
  })

  it('e os dois lados na MESMA conta não se pareiam — é o estorno', async () => {
    // A guarda que meu primeiro fixture não exercitava: sem ela, uma compra e o estorno dela no
    // mesmo cartão, no mesmo valor e no mesmo dia, virariam uma "transferência" — e os dois
    // sumiriam do total, porque transferência não é entrada nem saída. O gasto desapareceria da
    // categoria e ninguém procuraria por ele.
    const result = await runIngest(
      input(
        [file('docs/extrato/a/janeiro.ofx', OFX([TRN('20260105', '-500.00', 'PIX ENVIADO FULANO DE TAL'), TRN('20260105', '500.00', 'PIX RECEBIDO FULANO DE TAL')].join('\n'), '111'))],
        [CORRENTE],
      ),
    )
    assert.equal(result.transfers.length, 0, 'mesma conta não é mudança de bolso')
  })

  it('e uma saída sem par fica marcada como SEM CONTRAPARTE', async () => {
    // Ela parece transferência própria e não achou o outro lado — extrato que falta, conta que
    // não foi exportada. Fica dito na tela em vez de virar despesa.
    const result = await runIngest(input([file('docs/extrato/a/janeiro.ofx', OFX(TRN('20260105', '-500.00', 'PIX ENVIADO FULANO DE TAL'), '111'))], [CORRENTE]))
    assert.equal(result.transfers.length, 0)
    assert.equal(result.transactions[0].transferKind, 'unmatched-self')
  })
})

describe('pagamento de fatura exige um CARTÃO dos dois lados do par', () => {
  it('saída da conta e entrada no cartão viram pagamento de fatura', async () => {
    const result = await runIngest(
      input(
        [
          file('docs/extrato/a/janeiro.ofx', OFX(TRN('20260110', '-1200.00', 'PAGAMENTO DE FATURA'), '111')),
          file('docs/fatura/b/janeiro.ofx', OFX(TRN('20260110', '1200.00', 'PAGAMENTO RECEBIDO FULANO DE TAL'), '333')),
        ],
        [CORRENTE, CARTAO],
      ),
    )
    assert.equal(result.transfers.length, 1)
    assert.equal(result.transfers[0].kind, 'card-payment')
  })

  it('e uma transferência comum NÃO pode envolver cartão', async () => {
    // A regra é uma igualdade, não um `ou`: a categoria de pagamento e a presença de cartão têm de
    // combinar. Sem ela, um Pix para a poupança no mesmo valor de uma fatura casaria com o cartão
    // — a fatura sumiria do gasto e o Pix viraria transferência que não houve.
    const result = await runIngest(
      input(
        [
          file('docs/extrato/a/janeiro.ofx', OFX(TRN('20260110', '-1200.00', 'PIX ENVIADO FULANO DE TAL POUPANCA'), '111')),
          file('docs/fatura/b/janeiro.ofx', OFX(TRN('20260110', '1200.00', 'CREDITO FULANO DE TAL'), '333')),
        ],
        [CORRENTE, CARTAO],
      ),
    )
    assert.equal(result.transfers.length, 0, 'sem categoria de fatura, o cartão não entra no par')
  })
})
