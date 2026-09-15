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

/**
 * UMA LINHA RUIM NÃO DERRUBA O ARQUIVO — as guardas que faltavam.
 *
 * Todo teste acima entrega um arquivo bem-formado e confere a leitura. O que o medidor mostrou em
 * falta é o outro lado: o que este módulo faz com lixo. E ele lê arquivos que ninguém aqui
 * escreveu — exportações de cinco bancos, cada uma com o seu jeito de omitir um campo —, então
 * "lixo" não é hipótese: é terça-feira.
 *
 * A regra do módulo é DESCARTAR a linha e seguir, nunca estourar e nunca inventar. As duas pontas
 * importam: uma exceção perde o extrato inteiro por causa de um rodapé, e um valor inventado entra
 * na soma sem nada avisar. O que se perde de propósito — uma linha — o relatório não menciona, e é
 * por isso que a alternativa tem de ser pior, não melhor.
 */
describe('o OFX com bloco incompleto', () => {
  it('lançamento SEM `TRNAMT` entra como R$ 0,00 — e isto é um achado, não um projeto', () => {
    // Escrevi este teste esperando o descarte, e ele falhou. O que o código faz:
    //
    //     const amount = Number.parseFloat(ofxTag(block, 'TRNAMT') ?? '0')
    //     if (!posted || Number.isNaN(amount)) continue
    //
    // O `?? '0'` torna TAG AUSENTE indistinguível de VALOR ZERO, e com isso anula a guarda da
    // linha seguinte para este caso: `parseFloat('0')` não é `NaN`, então a linha sobrevive. A
    // guarda existe e está certa; o que passa por baixo dela é o `??`.
    //
    // O efeito é um lançamento de R$ 0,00 no extrato — ruído que atravessa tudo: entra na
    // contagem, pede categoria, e ninguém sabe de onde veio. Não é catastrófico, e por isso está
    // PRESO aqui em vez de consertado por mim: mexer no valor padrão de um parser é decisão do
    // dono do módulo, e existe a leitura oposta (um OFX pode trazer `<TRNAMT>0</TRNAMT>` de
    // propósito, e hoje os dois casos são o mesmo).
    //
    // No dia em que alguém trocar o `?? '0'` por um descarte, este teste fica vermelho e obriga a
    // decisão a ser tomada de frente. Registrado em "Débitos em aberto".
    const semValor = '<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260105120000[-3:BRT]</DTPOSTED><MEMO>MERCADO X</MEMO><FITID>x1</FITID></STMTTRN>'
    const parsed = parseOfx(ofx(STMT(`${semValor}\n${TRN()}`)))
    assert.deepEqual(
      parsed.transactions.map((t) => t.amount),
      [0, -123.45],
      'o comportamento de hoje, e não o desejável',
    )
  })

  it('e sem MEMO nem NAME a descrição fica VAZIA, em vez de estourar', () => {
    // A descrição some, e isso é aceitável: o valor e a data estão certos, e a linha cai em
    // "outros" pedindo categoria. Perder o extrato inteiro por causa dela não seria.
    const [tx] = parseOfx(ofx(STMT(TRN({ memo: '' })))).transactions
    assert.equal(tx.description, '')
    assert.equal(tx.amount, -123.45, 'o resto da linha atravessa')
  })
})

describe('o CSV da XP com linha truncada', () => {
  const csv = (linhas: string) => ({ path: 'docs/fatura/xp/2026-02-10.csv', bytes: new TextEncoder().encode(`Data;Estabelecimento;Portador;Valor;Parcela\n${linhas}`) })

  it('linha sem coluna de valor é descartada, e as vizinhas entram', () => {
    // O caso real é a última linha de um arquivo cortado no meio da exportação. Ela não pode
    // derrubar a fatura, e também não pode virar uma compra de valor indefinido.
    const parsed = parseXpInvoiceCsv(csv(['05/01/2026;MERCADO X;FULANO;1.234,56;-', '06/01/2026;LOJA', '07/01/2026;PADARIA;FULANO;50,00;-'].join('\n')), [])
    assert.deepEqual(
      parsed.transactions.map((t) => t.amount),
      [-1234.56, -50],
    )
  })

  it('valor que não é número é descartado — não vira NaN na soma', () => {
    // `NaN` é o pior dos descartes possíveis: ele não estoura, propaga-se por toda soma que o
    // toque, e o total do mês vira "NaN" na tela sem dizer qual linha o causou.
    const parsed = parseXpInvoiceCsv(csv(['05/01/2026;MERCADO X;FULANO;--;-', '06/01/2026;PADARIA;FULANO;50,00;-'].join('\n')), [])
    assert.deepEqual(
      parsed.transactions.map((t) => t.amount),
      [-50],
    )
  })

  it('data fora do formato brasileiro descarta a linha, em vez de deslocar o dia', () => {
    // `brDate` só aceita `dd/mm/aaaa`. Um ISO vindo por engano seria lido ao contrário pelo
    // formato — dia e mês trocados — e 05/01 viraria 01/05 sem nada acusar.
    const parsed = parseXpInvoiceCsv(csv(['2026-01-05;MERCADO X;FULANO;10,00;-', '06/01/2026;PADARIA;FULANO;50,00;-'].join('\n')), [])
    assert.deepEqual(
      parsed.transactions.map((t) => t.postedDate),
      ['2026-01-06'],
    )
  })

  it('portador VAZIO não vira `(undefined)` colado na descrição', () => {
    // A regra de categoria casa por TEXTO: um `(undefined)` grudado no fim faz o estabelecimento
    // deixar de ser reconhecido, e o gasto cai em "outros" com o valor certo.
    const [tx] = parseXpInvoiceCsv(csv('05/01/2026;MERCADO X;;1.234,56;-'), []).transactions
    assert.equal(tx.description, 'MERCADO X')
  })

  it('e a metade `holder ?` dessa guarda é INALCANÇÁVEL — medido', () => {
    // Descoberto pela falsificação: trocar `holder ? … : false` por `selfNamePatterns.some(…)` sem
    // guarda nenhuma não quebrou teste algum, porque o caso não existe. `line.split(';')` devolve
    // `[date, merchant, holder, value, …]`, e a guarda anterior já descarta `value === undefined`
    // — para `value` estar definido, `holder` é string, no máximo vazia. Nunca `undefined`.
    //
    // Fica escrito em vez de o guarda ser removido: ele custa nada, e a assinatura do `split` é
    // frágil o bastante para que uma reordenação de colunas do CSV volte a torná-lo necessário.
    // O que não pode é alguém depois olhar a linha e achar que há um caso testado ali.
    for (const line of ['05/01/2026;MERCADO X', '05/01/2026;MERCADO X;', '05/01/2026;MERCADO X;;10,00']) {
      const [, , holder, value] = line.split(';')
      if (value !== undefined) assert.equal(typeof holder, 'string', 'valor definido implica portador string')
    }
  })
})
