import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Budget } from '@wlet/domain'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { type AccountProfile, type IngestInput, pickBestFormat, runIngest } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'

/**
 * O pipeline de ponta a ponta, sobre um extrato SINTÉTICO.
 *
 * `packages/ingest` era o maior vão da suíte, e a razão registrada era "testá-los exige fixture de
 * extrato real, e extrato real é dado bancário". A premissa estava errada pela metade: o que os
 * leitores precisam é de um arquivo no FORMATO, não de um arquivo de verdade. Um OFX escrito aqui
 * dentro tem dez linhas, não contém dado de ninguém, e exercita `pipeline` + `parsers` + `rules` +
 * `matching` juntos — que é o caminho que produz todo número do app.
 *
 * O núcleo é testável porque foi desenhado assim, e os docblocks dizem por quê: `env` entra por
 * injeção (`IngestEnv`, em `io.ts`) e `now` também, "para o mesmo `docs/` não produzir dois JSON
 * diferentes". As duas decisões estavam escritas e nunca tinham sido cobradas.
 */
const OFX = (transactions: string, over: { acctId?: string; bankId?: string } = {}) => `
OFXHEADER:100
<OFX>
  <SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO EXEMPLO</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <BANKACCTFROM><BANKID>${over.bankId ?? '001'}</BANKID><ACCTID>${over.acctId ?? '12345-6'}</ACCTID></BANKACCTFROM>
    <BANKTRANLIST><DTSTART>20260101</DTSTART><DTEND>20260131</DTEND>
${transactions}
    </BANKTRANLIST>
    <LEDGERBAL><BALAMT>1000.00</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL>
  </STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

const TRN = (date: string, amount: string, memo: string, fitId = `${date}-${amount}`) =>
  `      <STMTTRN><TRNTYPE>${Number(amount) > 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amount}</TRNAMT><FITID>${fitId}</FITID><MEMO>${memo}</MEMO></STMTTRN>`

const file = (path: string, text: string): SourceFile => ({ path, bytes: new TextEncoder().encode(text) })

const PROFILE: AccountProfile = {
  id: 'conta-exemplo',
  name: 'Conta Exemplo',
  bank: 'Banco Exemplo',
  bankCode: '001',
  type: 'checking',
  entity: 'PF',
  holder: 'Fulano',
  match: { bankCode: '001' },
}

const budget: Budget = { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] }

const input = (sources: SourceFile[], over: Partial<IngestInput> = {}): IngestInput => ({
  sources,
  accounts: [PROFILE],
  selfNamePatterns: [],
  rules: buildRules(),
  planned: [],
  receivables: [],
  budget,
  goals: [],
  now: '2026-02-01T00:00:00.000Z',
  env: browserEnv,
  ...over,
})

describe('o pipeline lê um extrato e produz lançamentos', () => {
  it('data, valor, conta e categoria atravessam', async () => {
    const ofx = OFX([TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'), TRN('20260110', '5000.00', 'PIX RECEBIDO DE CLIENTE')].join('\n'))
    const result = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))

    assert.equal(result.transactions.length, 2)
    const outflow = result.transactions.find((t) => t.amount < 0)
    assert.ok(outflow)
    assert.equal(outflow.date, '2026-01-05')
    assert.equal(outflow.amount, -120.5)
    assert.equal(outflow.accountId, 'conta-exemplo', 'a conta saiu do perfil declarado, pelo código do banco')
    assert.equal(outflow.categoryId, 'saude', 'a regra de drogaria pegou')
  })

  it('o mesmo arquivo, duas vezes, NÃO duplica lançamento', async () => {
    // A pessoa baixa o extrato de novo e joga na pasta. Sem a deduplicação por id, janeiro
    // apareceria com o dobro do gasto — e nada indicaria que foi o download repetido.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const { transactions, report } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx), file('docs/extrato/exemplo/janeiro (1).ofx', ofx)]))

    assert.equal(transactions.length, 1, 'um lançamento, não dois')
    assert.ok(report.duplicated.length >= 1 || report.skipped.length >= 1, 'o relatório registra o que foi descartado')
  })

  it('o id é DETERMINÍSTICO: duas rodadas do mesmo arquivo dão o mesmo id', async () => {
    // É o que sustenta o ajuste manual de categoria: `overrides` é chaveado pelo id do
    // lançamento. Um id que mudasse a cada ingestão apagaria todo ajuste em silêncio.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const um = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))
    const dois = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))
    assert.equal(um.transactions[0].id, dois.transactions[0].id)
  })

  it('`now` é INJETADO, então o mesmo `docs/` produz o mesmo resultado', async () => {
    // O docblock de `IngestInput` diz que `generatedAt` saía de `new Date()` e tornava a saída
    // incomparável entre rodadas. A injeção é o que torna executável a conferência "mesmo docs,
    // mesmo resultado" — e sem teste ela era só uma promessa.
    const ofx = OFX(TRN('20260105', '-120.50', 'DROGARIA SAO PAULO'))
    const { meta } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)], { now: '2026-03-09T12:00:00.000Z' }))
    assert.equal(meta.generatedAt, '2026-03-09T12:00:00.000Z')
  })

  it('conta que nenhum perfil reconhece é CRIADA, e o relatório a nomeia', async () => {
    // Escrevi este teste esperando que o lançamento fosse DESCARTADO, e ele não é — o pipeline
    // fabrica a conta a partir dos metadados do próprio OFX. O comportamento real é melhor do que
    // o que eu supus: descartar faria o dinheiro sumir da soma sem nada dizer, e quem lê um total
    // menor não tem como saber que faltou um extrato. Criar mantém o número certo e empurra a
    // decisão para quem lê o relatório, que é onde ela pertence.
    //
    // Fica preso aqui porque é exatamente o tipo de coisa que alguém "conserta" para descartar.
    const ofx = OFX(TRN('20260105', '-80.00', 'PADARIA'), { bankId: '999', acctId: '77' })
    const { transactions, accounts, report } = await runIngest(input([file('docs/extrato/desconhecido/janeiro.ofx', ofx)], { accounts: [] }))

    assert.equal(transactions.length, 1, 'o lançamento entra')
    assert.equal(accounts.length, 1, 'com uma conta fabricada para ele')
    assert.equal(transactions[0].accountId, accounts[0].id, 'e apontando para ela — nenhum lançamento fica sem conta')
    assert.deepEqual(report.unknownAccounts, [accounts[0].id], 'o relatório diz qual conta nasceu sozinha')
  })
})

describe('pickBestFormat', () => {
  it('o mesmo extrato em dois formatos entra UMA vez', async () => {
    // Bancos oferecem o mesmo mês em OFX e CSV. Ler os dois duplicaria o mês inteiro.
    const picked = pickBestFormat([file('docs/extrato/exemplo/janeiro.ofx', ''), file('docs/extrato/exemplo/janeiro.csv', '')])
    assert.equal(picked.length, 1)
    assert.match(picked[0].path, /\.ofx$/, 'o OFX ganha: ele traz identificador de lançamento e saldo')
  })

  it('meses diferentes continuam entrando os dois', () => {
    const picked = pickBestFormat([file('docs/extrato/exemplo/janeiro.ofx', ''), file('docs/extrato/exemplo/fevereiro.ofx', '')])
    assert.equal(picked.length, 2)
  })
})

/**
 * QUAL ARQUIVO VENCE, e QUAL LANÇAMENTO É DUPLICATA — o bloco que decide se dinheiro é contado
 * duas vezes ou some.
 *
 * O medidor apontou `pipeline.ts` com 79,3% de ramos, e este é o grupo de maior consequência entre
 * os que faltavam. Os dois erros possíveis são opostos e nenhum estoura: contar duas vezes infla o
 * mês, e descartar demais faz um gasto sumir de um extrato que o contém. Nos dois casos os totais
 * continuam plausíveis, porque o que está errado é a CONTAGEM e não os valores.
 *
 * O núcleo é um mecanismo só — o `ordinal` na chave do lançamento — que precisa fazer coisas
 * OPOSTAS conforme o contexto, e o módulo declara isso: "o `ordinal` distingue repetições DENTRO de
 * um arquivo; ele não distingue arquivos, e é de propósito: o mesmo lançamento lido de dois
 * extratos sobrepostos precisa colidir". Os dois primeiros testes abaixo são esse par, e é a tensão
 * entre eles que impede a "correção" de um de quebrar o outro em silêncio.
 */
describe('o mesmo mecanismo separa dentro do arquivo e junta entre arquivos', () => {
  it('duas linhas IDÊNTICAS no mesmo extrato são DOIS lançamentos', async () => {
    // Dois cafés de R$ 12,00 no mesmo dia, no mesmo lugar. O banco exporta as duas linhas com o
    // mesmo valor, a mesma data e a mesma descrição — e, num extrato sem `FITID`, sem nada que as
    // separe. Sem o `ordinal` as duas colidiriam num id só e a segunda sumiria: o dia perderia
    // R$ 12,00 e o extrato na tela mostraria uma linha onde o banco mostra duas.
    const dois = [TRN('20260105', '-12.00', 'CAFETERIA', ''), TRN('20260105', '-12.00', 'CAFETERIA', '')].join('\n')
    const { transactions } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', OFX(dois))]))

    assert.equal(transactions.length, 2, 'duas compras, não uma')
    assert.notEqual(transactions[0].id, transactions[1].id, 'e ids distintos, senão o ajuste de categoria de uma valeria pela outra')
  })

  it('a mesma linha em dois extratos SOBREPOSTOS conta UMA vez — e o relatório diz quantas', async () => {
    // O contrário, pelo mesmo mecanismo: aqui a colisão é desejada. Os dois arquivos precisam ter
    // períodos diferentes para chegarem juntos até a deduplicação — com o mesmo período, o bloco
    // anterior já descartaria um deles como documento repetido, e este teste passaria sem exercitar
    // a contagem de duplicatas.
    const janeiro = OFX(TRN('20260105', '-120.50', 'DROGARIA'))
    const sobreposto = OFX(TRN('20260105', '-120.50', 'DROGARIA')).replace('<DTSTART>20260101', '<DTSTART>20260103')
    const { transactions, report } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', janeiro), file('docs/extrato/exemplo/janeiro-parcial.ofx', sobreposto)]))

    assert.equal(transactions.length, 1)
    assert.deepEqual(report.duplicated, [{ accountId: 'conta-exemplo', count: 1 }], 'o descarte é CONTADO, não silencioso')
  })
})

describe('dois documentos do mesmo período: vence o MAIOR', () => {
  it('a exportação parcial não substitui a completa, e o relatório nomeia a descartada', async () => {
    // O caso real é baixar o extrato do mês antes de ele fechar e baixar de novo depois. Os dois
    // arquivos cobrem o mesmo período da mesma conta; se o parcial vencesse, os lançamentos do fim
    // do mês sumiriam — e o saldo da tela passaria a discordar do banco sem nada avisar.
    //
    // A ordem importa para o teste valer: o COMPLETO entra primeiro, então o parcial precisa perder
    // por comparação, e não por chegar depois.
    const completo = OFX([TRN('20260105', '-120.50', 'DROGARIA'), TRN('20260120', '-80.00', 'MERCADO')].join('\n'))
    const parcial = OFX(TRN('20260105', '-120.50', 'DROGARIA'))
    const { transactions, report } = await runIngest(input([file('docs/extrato/exemplo/janeiro-completo.ofx', completo), file('docs/extrato/exemplo/janeiro-parcial.ofx', parcial)]))

    assert.equal(transactions.length, 2, 'os dois lançamentos do arquivo completo')
    assert.deepEqual(report.skipped, ['docs/extrato/exemplo/janeiro-parcial.ofx'])
  })

  it('e o completo vence mesmo chegando DEPOIS — quem é descartado é o que já estava', async () => {
    // O outro lado do `if (current)`: aqui o parcial já ocupava a chave e precisa ser expulso. Um
    // `else` que só ignorasse o recém-chegado deixaria o resultado dependendo da ORDEM ALFABÉTICA
    // dos arquivos na pasta, que é o tipo de defeito que só aparece quando alguém renomeia um.
    const completo = OFX([TRN('20260105', '-120.50', 'DROGARIA'), TRN('20260120', '-80.00', 'MERCADO')].join('\n'))
    const parcial = OFX(TRN('20260105', '-120.50', 'DROGARIA'))
    const { transactions, report } = await runIngest(input([file('docs/extrato/exemplo/a-parcial.ofx', parcial), file('docs/extrato/exemplo/b-completo.ofx', completo)]))

    assert.equal(transactions.length, 2)
    assert.deepEqual(report.skipped, ['docs/extrato/exemplo/a-parcial.ofx'])
  })
})

describe('o SALDO que vale é o mais recente', () => {
  it('o extrato mais novo vence mesmo sendo LIDO por último', async () => {
    // O saldo não é somado: é escolhido. Dois arquivos da mesma conta trazem cada um o seu
    // `LEDGERBAL`, e ficar com o mais antigo mostraria na tela um saldo que o banco já não tem —
    // sem contradizer lançamento nenhum, porque os lançamentos estão todos certos.
    //
    // **Os nomes dos arquivos são o teste, e isso custou uma volta.** A primeira versão usava
    // `janeiro.ofx` e `fevereiro.ofx` e passava COM a comparação de data removida: `pickBestFormat`
    // ORDENA POR CAMINHO antes de tudo, então "fevereiro" vinha sempre primeiro, o `!current` já
    // devolvia o saldo certo e a comparação nunca rodava. Ler nas duas ordens de entrada não
    // ajudava — a ordenação apaga a diferença. Com `a-` e `b-`, o mais ANTIGO chega primeiro e o
    // mais novo precisa vencer por data, que é a única coisa que este teste existe para provar.
    const antigo = OFX(TRN('20260105', '-120.50', 'DROGARIA'))
    const novo = OFX(TRN('20260210', '-50.00', 'PADARIA'))
      .replace('<DTSTART>20260101</DTSTART><DTEND>20260131', '<DTSTART>20260201</DTSTART><DTEND>20260228')
      .replace('<BALAMT>1000.00</BALAMT><DTASOF>20260131', '<BALAMT>2500.00</BALAMT><DTASOF>20260228')
    const { accounts } = await runIngest(input([file('docs/extrato/exemplo/a-janeiro.ofx', antigo), file('docs/extrato/exemplo/b-fevereiro.ofx', novo)]))

    const account = accounts.find((a) => a.id === 'conta-exemplo')
    assert.deepEqual(account?.reportedBalance, { amount: 2500, asOf: '2026-02-28' })
  })
})

/**
 * A DIREÇÃO de uma transferência — o sinal que faz o dinheiro andar para o lado certo.
 *
 * Toda transferência inferida sai de um único `isOut = tx.amount < 0` e de cinco ternários que
 * dependem dele: de onde saiu, para onde foi, e qual das duas pontas tem lançamento. O valor é
 * `Math.abs`, então uma direção invertida NÃO desequilibra nada — as duas contas continuam
 * batendo, o total do mês não muda, e a tela de Patrimônio mostra dinheiro saindo da corretora no
 * mês em que você aportou.
 *
 * Os dois blocos abaixo eram os últimos de `pipeline.ts` com o lado do resgate nunca exercitado.
 */
const PROFILE_CARTAO: AccountProfile = { ...PROFILE, id: 'cartao-exemplo', name: 'Cartão Exemplo', type: 'credit-card', match: { bankCode: '001', accountType: 'credit-card' } }

describe('aporte e resgate apontam para lados opostos', () => {
  it('o APORTE sai da conta e entra na corretora', async () => {
    const ofx = OFX(TRN('20260110', '-2000.00', 'APLICACAO CONTA INVESTIMENTO'))
    const { transfers } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))

    assert.deepEqual(
      transfers.map((t) => [t.kind, t.fromAccountId, t.toAccountId, t.amount]),
      [['investment', 'conta-exemplo', 'xp-investimentos', 2000]],
    )
    assert.equal(transfers[0].toTransactionId, null, 'só a saída tem lançamento — o outro lado é a conta virtual')
  })

  it('e o RESGATE volta da corretora para a conta', async () => {
    // O espelho, e o que estava sem teste. Invertido, o mês em que você resgatou apareceria como
    // mês de aporte: o patrimônio na corretora cresceria em vez de cair, e a conta corrente
    // mostraria dinheiro saindo dela no dia em que ele entrou.
    const ofx = OFX(TRN('20260115', '3000.00', 'RESGATE CONTA INVESTIMENTO'))
    const { transfers, transactions } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))

    assert.deepEqual(
      transfers.map((t) => [t.kind, t.fromAccountId, t.toAccountId, t.amount]),
      [['investment', 'xp-investimentos', 'conta-exemplo', 3000]],
    )
    assert.equal(transfers[0].fromTransactionId, null, 'agora é a ENTRADA que tem lançamento')
    assert.equal(transfers[0].toTransactionId, transactions[0].id, 'e ela aponta para o lançamento lido, não para a conta virtual')
  })
})

describe('a contraparte INFERIDA, quando o outro lado não está no período', () => {
  it('o pagamento de fatura vira transferência, e não despesa', async () => {
    // O erro mais caro do módulo se este bloco não rodasse: as compras da fatura já contaram como
    // gasto quando foram lidas do cartão. O pagamento dela, se contasse como despesa da conta
    // corrente, somaria a fatura INTEIRA de novo — o mês dobraria, e cada linha estaria certa.
    //
    // A contraparte é achada por `siblingAccount`: mesma instituição, tipo oposto. Por isso o
    // fixture declara as duas contas do mesmo `bankCode`.
    const ofx = OFX(TRN('20260112', '-1800.00', 'PAGAMENTO DE FATURA'))
    const { transactions, transfers } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)], { accounts: [PROFILE, PROFILE_CARTAO] }))

    assert.deepEqual(
      transfers.map((t) => [t.kind, t.fromAccountId, t.toAccountId]),
      [['card-payment', 'conta-exemplo', 'cartao-exemplo']],
    )
    assert.equal(transactions[0].transferKind, 'card-payment')
    assert.equal(transactions[0].categoryId, 'pagamento-fatura')
    assert.match(transfers[0].description, /contraparte inferida/)
  })

  it('e o "Pix no Crédito" é INTERNO, não pagamento de fatura', async () => {
    // O outro ramo do mesmo bloco, e ele muda duas coisas de uma vez: o tipo da transferência e a
    // CATEGORIA do lançamento, que passa a ser `transferencia`. Tratá-lo como pagamento de fatura
    // o faria abater uma dívida que não existe; deixá-lo fora do bloco o faria virar gasto.
    const ofx = OFX(TRN('20260118', '-450.00', 'PIX NO CREDITO PARA FULANO'))
    const { transactions, transfers } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)], { accounts: [PROFILE, PROFILE_CARTAO] }))

    assert.deepEqual(
      transfers.map((t) => t.kind),
      ['internal'],
    )
    assert.equal(transactions[0].categoryId, 'transferencia', 'a categoria é REESCRITA aqui')
  })

  it('sem conta irmã no mesmo banco, NÃO se inventa contraparte', async () => {
    // A guarda que impede o bloco de fabricar um par. Sem o cartão no fixture não há para onde
    // apontar, e o certo é deixar o lançamento como está: uma transferência com contraparte
    // inventada some da conta errada, e some em silêncio.
    const ofx = OFX(TRN('20260112', '-1800.00', 'PAGAMENTO DE FATURA'))
    const { transfers, transactions } = await runIngest(input([file('docs/extrato/exemplo/janeiro.ofx', ofx)]))

    assert.deepEqual(transfers, [])
    assert.equal(transactions[0].transferId, null, 'o lançamento segue sem par')
  })
})

/**
 * A FATURA EM PDF que não fecha, e a data da parcela que cai em mês curto.
 *
 * Os dois últimos blocos de `pipeline.ts` sem cobertura, e os dois são sobre RECUSAR ou CORRIGIR em
 * vez de aceitar em silêncio. O caminho inteiro nunca tinha rodado num teste: bytes de PDF →
 * `readPdfLines` → `parseNubankInvoicePdf` → decisão do pipeline. `nubank-invoice.test.ts` cobre a
 * ANÁLISE entregando as linhas prontas, que é a forma certa de testá-la; o que faltava era provar
 * que o pipeline OBEDECE ao veredito dela.
 *
 * O fixture é um PDF escrito à mão, sem compressão e sem dependência nova — a estrutura de um PDF é
 * ASCII, e `decodeStream` devolve o fluxo cru quando o dicionário não declara `/FlateDecode`. Cada
 * caractere precisa de entrada no `/ToUnicode`, então o CMap abaixo é gerado como IDENTIDADE: o
 * código de dois bytes é o próprio ponto de código.
 */
const pdfInvoice = (lines: string[]): SourceFile => {
  const chars = [...new Set(lines.join('').split(''))]
  const hex = (n: number) => n.toString(16).padStart(4, '0')
  const cmap = `/CIDInit /ProcSet findresource begin\nbeginbfchar\n${chars.map((c) => `<${hex(c.charCodeAt(0))}> <${hex(c.charCodeAt(0))}>`).join('\n')}\nendbfchar\nend`
  // Dois bytes por caractere: `\000` (octal) seguido do próprio byte, escapando o que o PDF reserva.
  const escaped = (text: string) => [...text].map((c) => `\\000${/[()\\]/.test(c) ? `\\${c}` : c}`).join('')
  const content = lines.map((text, i) => `BT /F1 10 Tf 1 0 0 1 50 ${700 - i * 20} Tm (${escaped(text)}) Tj ET`).join('\n')
  const body = [
    `1 0 obj << /Type /Font /Subtype /Type0 /ToUnicode 2 0 R >> endobj`,
    `2 0 obj << /Length ${cmap.length} >> stream\n${cmap}\nendstream endobj`,
    `3 0 obj << /Font << /F1 1 0 R >> /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ].join('\n')
  return { path: 'docs/fatura/nubank/2026-03-10.pdf', bytes: new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`) }
}

describe('fatura de PDF que não fecha é RECUSADA, não importada com aviso', () => {
  it('a fatura que fecha entra inteira', async () => {
    // O controle: sem ele, o teste seguinte poderia estar recusando por qualquer outro motivo — um
    // fixture que o leitor de PDF não entende produziria zero lançamentos do mesmo jeito.
    const { transactions, report } = await runIngest(input([pdfInvoice(['05 FEV MERCADO X 123,45', 'Total de compras R$ 123,45'])], { accounts: [PROFILE_CARTAO] }))

    assert.equal(transactions.length, 1)
    assert.equal(transactions[0].amount, -123.45)
    assert.deepEqual(report.pdfProblems, [])
  })

  it('a que não fecha não entra, e o relatório diz o porquê', async () => {
    // "Dado de PDF que não confere com o total impresso é dado errado, e errado em silêncio é pior
    // que ausente." Um caractere perdido na reconstrução por posição vira um valor errado, e o
    // total declarado é a única forma de saber. Importar com aviso poria o número errado na tela,
    // onde ele soma — e o aviso fica no relatório, que ninguém abre depois da primeira vez.
    const { transactions, report } = await runIngest(input([pdfInvoice(['05 FEV MERCADO X 123,45', 'Total de compras R$ 999,99'])], { accounts: [PROFILE_CARTAO] }))

    assert.deepEqual(transactions, [], 'nada entra')
    assert.equal(report.pdfProblems.length, 1)
    assert.match(report.pdfProblems[0], /2026-03-10\.pdf.*não bate com o declarado/)
  })
})

describe('a parcela cai no mês certo, mesmo quando o mês é CURTO', () => {
  it('uma compra do dia 31 em 2/6 vence no último dia de fevereiro, não em março', async () => {
    // A data da parcela é a da compra deslocada de `current - 1` meses. Somar o mês sem encaixar o
    // dia faz 31 de janeiro virar 3 de MARÇO — a parcela pula um mês inteiro, aparece na previsão
    // do mês errado, e fevereiro fica sem a despesa que ele tem.
    const { transactions } = await runIngest(input([pdfInvoice(['31 JAN ACADEMIA - 2/6 200,00', 'Total de compras R$ 200,00'])], { accounts: [PROFILE_CARTAO] }))

    assert.deepEqual(transactions[0].installment, { current: 2, total: 6 })
    assert.equal(transactions[0].date, '2026-02-28', 'encaixado no último dia do mês curto')
    assert.equal(transactions[0].postedDate, '2026-01-31', 'e a data da COMPRA não se mexe')
  })
})
