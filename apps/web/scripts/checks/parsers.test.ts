import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SourceFile } from '@wlet/ingest/io'
import { canonicalName, parseOfx, parseXpInvoiceCsv } from '@wlet/ingest/parsers'

/**
 * A PORTA DE ENTRADA de todo arquivo bancário — exercitada até agora só de raspão.
 *
 * `pipeline.test.ts` passa um OFX feliz e confere o que sai do pipeline inteiro. O que não havia
 * era teste das bordas DESTE módulo, e é nelas que mora o erro que o projeto mais teme: a data.
 * Um OFX escreve `20260105120000[-3:BRT]`, e a "modernização" óbvia — `new Date(valor)` — desloca
 * o dia inteiro a oeste de Greenwich. Não estoura; o extrato inteiro anda 24 horas, e os meses
 * ganham e perdem lançamentos nas bordas.
 */
const ofx = (body: string, path = 'docs/extrato/inter/2026-01.ofx'): SourceFile => ({ path, bytes: new TextEncoder().encode(body) })

const STMT = (trn: string, extra = '') => `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Inter</ORG><FID>077</FID></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>00416968</BANKID><ACCTID>9988776</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260101000000[-3:BRT]</DTSTART><DTEND>20260131235959[-3:BRT]</DTEND>
${trn}
</BANKTRANLIST><LEDGERBAL><BALAMT>1234.56</BALAMT><DTASOF>20260131120000[-3:BRT]</DTASOF></LEDGERBAL>
${extra}</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const TRN = (over: Partial<Record<'dt' | 'amt' | 'memo' | 'name' | 'fit', string>> = {}) =>
  `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>${over.dt ?? '20260105120000[-3:BRT]'}</DTPOSTED><TRNAMT>${over.amt ?? '-123.45'}</TRNAMT>${
    over.memo === undefined ? '<MEMO>MERCADO X</MEMO>' : over.memo ? `<MEMO>${over.memo}</MEMO>` : ''
  }${over.name ? `<NAME>${over.name}</NAME>` : ''}<FITID>${over.fit ?? 'abc123'}</FITID></STMTTRN>`

describe('a data do OFX é LIDA, nunca interpretada', () => {
  it('o fuso e a hora são descartados: ficam os oito primeiros dígitos', () => {
    // `20260105120000[-3:BRT]` é 5 de janeiro. Passado por `new Date`, o app que roda a oeste de
    // Greenwich mostra 4 — e o lançamento muda de mês na virada. É a mesma armadilha que
    // `format.ts` evita partindo a string ISO, aqui na entrada em vez da saída.
    const [tx] = parseOfx(ofx(STMT(TRN({ dt: '20260105120000[-3:BRT]' })))).transactions
    assert.equal(tx.postedDate, '2026-01-05')
  })

  it('o primeiro dia do mês não retrocede', () => {
    // O caso que a armadilha quebra de forma visível: 01/01 vira 31/12 do ano anterior.
    const [tx] = parseOfx(ofx(STMT(TRN({ dt: '20260101000000[-3:BRT]' })))).transactions
    assert.equal(tx.postedDate, '2026-01-01')
  })

  it('e o período e o saldo leem a mesma régua', () => {
    const parsed = parseOfx(ofx(STMT(TRN())))
    assert.deepEqual(parsed.period, { from: '2026-01-01', to: '2026-01-31' })
    assert.deepEqual(parsed.balance, { amount: 1234.56, asOf: '2026-01-31' })
  })

  it('data irreconhecível DESCARTA o lançamento, em vez de inventar um', () => {
    // Um `postedDate` nulo viraria `Invalid Date` três camadas adiante, ou um mês vazio. Melhor
    // perder a linha e o relatório do ingest contar do que gravar uma data que não existe.
    assert.equal(parseOfx(ofx(STMT(TRN({ dt: 'sem-data' })))).transactions.length, 0)
  })

  it('valor não numérico também descarta', () => {
    assert.equal(parseOfx(ofx(STMT(TRN({ amt: 'R$ 12' })))).transactions.length, 0)
  })
})

describe('o que o OFX diz sobre a conta', () => {
  it('cartão e conta corrente se distinguem pelo bloco, não pelo nome do arquivo', () => {
    const conta = parseOfx(ofx(STMT(TRN())))
    assert.equal(conta.accountType, 'checking')
    assert.equal(conta.kind, 'statement')

    const cartao = parseOfx(ofx(STMT(TRN()).replace('<BANKMSGSRSV1>', '<CREDITCARDMSGSRSV1><BANKMSGSRSV1>')))
    assert.equal(cartao.accountType, 'credit-card')
    assert.equal(cartao.kind, 'invoice')
  })

  it('o saldo é de CONTA: uma fatura não tem saldo a informar', () => {
    // Saldo de fatura seria o total em aberto, não patrimônio. Gravá-lo como saldo faria a soma
    // das contas incluir dívida com sinal trocado.
    const cartao = parseOfx(ofx(STMT(TRN()).replace('<BANKMSGSRSV1>', '<CREDITCARDMSGSRSV1><BANKMSGSRSV1>')))
    assert.equal(cartao.balance, null)
  })

  it('o código do banco perde o zero à esquerda, e só ele', () => {
    // `077` é o Inter; `0416968` não é código de banco nenhum e tem de sobreviver inteiro para
    // o perfil de conta poder recusá-lo. O corte só vale quando sobram TRÊS dígitos.
    // Eu havia escrito que `0237` fica inteiro, e o módulo me corrigiu: o corte vale quando
    // sobram TRÊS dígitos, então `0237` vira `237` — que é o código do Bradesco como todo mundo
    // o escreve. O que ele não pode encurtar é um número que não é código de banco.
    assert.equal(parseOfx(ofx(STMT(TRN()))).bankCode, '077')
    assert.equal(parseOfx(ofx(STMT(TRN()).replace('<FID>077</FID>', '<FID>0237</FID>'))).bankCode, '237')
    assert.equal(parseOfx(ofx(STMT(TRN()).replace('<FID>077</FID>', '<FID>00416968</FID>'))).bankCode, '00416968', 'oito dígitos não são código de banco')
  })

  it('a descrição cai no `NAME` quando não há `MEMO`', () => {
    // Bancos diferentes preenchem um ou outro. Sem a queda, metade dos extratos viria com
    // descrição vazia — e sem descrição nenhuma regra de categoria casa.
    const [tx] = parseOfx(ofx(STMT(TRN({ memo: '', name: 'PIX ENVIADO' })))).transactions
    assert.equal(tx.description, 'PIX ENVIADO')
  })

  it('e as entidades HTML voltam a ser caracteres', () => {
    // `POSTO &amp; CIA` gravado como está vira uma descrição que nenhuma regra casa, e que a
    // pessoa lê com o `&amp;` no meio.
    const [tx] = parseOfx(ofx(STMT(TRN({ memo: 'POSTO &amp; CIA' })))).transactions
    assert.equal(tx.description, 'POSTO & CIA')
  })
})

describe('o arquivo baixado duas vezes', () => {
  it('o sufixo `(1)` sai do nome canônico — é assim que a repetição é vista', () => {
    // O navegador nomeia o segundo download `extrato (1).ofx`. Sem o nome canônico ele entra como
    // arquivo novo e todo lançamento conta duas vezes.
    assert.equal(canonicalName('docs/extrato/extrato (1).ofx'), 'extrato.ofx')
    assert.equal(canonicalName('docs/extrato/extrato (12).ofx'), 'extrato.ofx')
  })

  it('e um parêntese que faz parte do nome fica', () => {
    // O corte é ancorado na extensão de propósito: `fatura (janeiro).pdf` é nome de verdade.
    assert.equal(canonicalName('docs/fatura (janeiro).pdf'), 'fatura (janeiro).pdf')
    assert.equal(canonicalName('docs/extrato (1) antigo.ofx'), 'extrato (1) antigo.ofx')
  })
})

describe('a fatura da XP em CSV', () => {
  const csv = (linhas: string) => ({ path: 'docs/fatura/xp/2026-02-10.csv', bytes: new TextEncoder().encode(`Data;Estabelecimento;Portador;Valor;Parcela\n${linhas}`) })

  it('o valor em pt-BR vira número, e a COMPRA entra com sinal de saída', () => {
    // Duas regras numa linha, e eu errei a segunda antes de ler: `1.234,56` lido por `parseFloat`
    // dá 1.234 — três casas perdidas e o ponto entendido como decimal, erro que some no meio de
    // uma fatura grande. E o CSV escreve compra como POSITIVO; o parser nega, porque no app
    // saída é negativa. Sem a inversão, a fatura inteira entraria como receita.
    const [tx] = parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;FULANO;1.234,56;-'), []).transactions
    assert.equal(tx.amount, -1234.56)
    assert.equal(tx.postedDate, '2026-01-05')
  })

  it('a parcela é escrita por EXTENSO no CSV da XP', () => {
    // `2 de 6`, não `2/6` — foi o módulo que me disse. Uma parcela não lida vira compra à vista,
    // e a previsão perde as quatro que ainda vão cair.
    const [tx] = parseXpInvoiceCsv(csv('05/01/2026;AIRBNB;FULANO;937,03;2 de 6'), []).transactions
    assert.deepEqual(tx.installment, { current: 2, total: 6 })
  })

  it('parcela ÚNICA não é parcelamento', () => {
    assert.equal(parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;FULANO;10,00;1 de 1'), []).transactions[0].installment, null)
  })

  it('o portador só é anotado quando NÃO é o titular', () => {
    // É o que distingue a compra do cartão adicional. Anotar o titular em toda linha encheria a
    // descrição de ruído e quebraria as regras de categoria que casam pelo começo do texto.
    const titular = [/FULANO/i]
    assert.equal(parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;FULANO;10,00;-'), titular).transactions[0].description, 'MERCADO X')
    assert.equal(parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;BELTRANA;10,00;-'), titular).transactions[0].description, 'MERCADO X (BELTRANA)')
  })

  it('e a fatura é fatura: tipo de conta e espécie vêm do formato', () => {
    const parsed = parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;FULANO;10,00;-'), [])
    assert.equal(parsed.accountType, 'credit-card')
    assert.equal(parsed.kind, 'invoice')
    assert.equal(parsed.invoiceDueDate, '2026-02-10', 'o vencimento vem do nome do arquivo')
  })
})
