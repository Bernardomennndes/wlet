import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { parseNubankInvoicePdf } from '@wlet/ingest/parsers'

/**
 * A fatura do Nubank em PDF — um parser inteiro que o medidor mostrou SEM TESTE (linhas 230-303).
 *
 * Ele lê o formato mais frágil que o app aceita: não há OFX nem CSV de fatura antiga do Nubank, só
 * o PDF, e a linha vem como texto reconstruído por posição. Dois defeitos reais estão registrados
 * no módulo e viraram teste aqui — os dois inflavam a fatura sem estourar nada.
 *
 * O leitor de linhas é INJETADO (`PdfLineReader`), então este arquivo não precisa montar PDF: ele
 * entrega as linhas prontas e mede só o que o parser faz com elas. É a mesma razão de o parâmetro
 * existir, e é o que separa testar a ANÁLISE de testar a extração — que tem teste próprio.
 */
const invoice = (path: string, lines: string[]) => {
  const file: SourceFile = { path, bytes: new Uint8Array() }
  return parseNubankInvoicePdf(file, browserEnv, async () => lines.map((text) => ({ text })))
}

/** Uma fatura fecha quando `Total de compras` bate com a soma dos débitos. */
const TOTAL = (valor: string) => `Total de compras R$ ${valor}`

describe('a linha da fatura vira lançamento', () => {
  it('dia, mês por extenso, descrição e valor', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['05 JAN MERCADO X 123,45', TOTAL('123,45')])
    assert.equal(parsed.transactions.length, 1)
    assert.equal(parsed.transactions[0].postedDate, '2026-01-05')
    assert.equal(parsed.transactions[0].description, 'MERCADO X')
    assert.equal(parsed.transactions[0].amount, -123.45)
    assert.equal(parsed.problem, null)
  })

  it('a parcela sai da descrição e vira número', async () => {
    // O sufixo ` - 2/6` é parte do texto da linha. Não extraído, ele fica no nome do
    // estabelecimento — e a compra deixa de ser reconhecida como parcelada, sumindo da previsão.
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['04 JAN AIRBNB - 2/6 937,03', TOTAL('937,03')])
    assert.deepEqual(parsed.transactions[0].installment, { current: 2, total: 6 })
    assert.equal(parsed.transactions[0].description, 'AIRBNB')
  })

  it('e `1/1` não é parcelamento', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['04 JAN LOJA - 1/1 50,00', TOTAL('50,00')])
    assert.equal(parsed.transactions[0].installment, null)
  })

  it('linha que não é lançamento é ignorada', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['FATURA DE FEVEREIRO', 'Vencimento 10 FEV 2026', '05 JAN MERCADO X 10,00', TOTAL('10,00')])
    assert.equal(parsed.transactions.length, 1)
  })
})

describe('o ano vem do VENCIMENTO, e vira quando o mês passa dele', () => {
  it('uma compra de dezembro numa fatura de janeiro é do ano anterior', async () => {
    // A fatura que vence em janeiro traz as compras de dezembro. Sem a virada, dezembro cairia em
    // 2026 e o ano fecharia com um mês de gasto no lugar errado — e o mês de dezembro real
    // apareceria vazio.
    const parsed = await invoice('docs/fatura/nubank/2026-01-10.pdf', ['20 DEZ MERCADO X 100,00', '05 JAN PADARIA 50,00', TOTAL('150,00')])
    assert.equal(parsed.transactions[0].postedDate, '2025-12-20')
    assert.equal(parsed.transactions[1].postedDate, '2026-01-05')
  })

  it('e numa fatura de dezembro, dezembro é do mesmo ano', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-12-10.pdf', ['20 DEZ MERCADO X 100,00', TOTAL('100,00')])
    assert.equal(parsed.transactions[0].postedDate, '2026-12-20')
  })
})

describe('o ciclo do Crédito de Confiança — o defeito que inflou uma fatura', () => {
  it('pagamento, estorno e crédito entram POSITIVO', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['01 JAN Pagamento em 01 JAN 500,00', '02 JAN Estorno de MERCADO X 21,40', '03 JAN Crédito de Confiança 21,40', TOTAL('0,00')])
    assert.deepEqual(
      parsed.transactions.map((t) => t.amount),
      [500, 21.4, 21.4],
    )
  })

  it('mas a REVERSÃO do crédito é débito', async () => {
    // O ciclo tem quatro passos, e tratar os quatro como crédito — ou os quatro como compra —
    // desequilibra a fatura pelo dobro do valor contestado. Foi exatamente 2 × 21,40 numa fatura
    // real, e a trava do total foi quem acusou.
    //
    // Fica dito o que a mutação mediu: a guarda `!/^revers/i` da fonte é INALCANÇÁVEL. O teste de
    // crédito é ANCORADO (`/^(pagamento em|estorno de|crédito de)/`), e "Reversão do Crédito de
    // Confiança" não começa por nenhum dos três — quem já a exclui é a âncora. Removida a guarda,
    // nenhum teste muda de cor. É a quinta guarda desta sessão que a falsificação mostra ser
    // redundante; ela documenta a intenção, e o comportamento abaixo é o que de fato vale.
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['04 JAN Reversão do Crédito de Confiança 21,40', TOTAL('21,40')])
    assert.equal(parsed.transactions[0].amount, -21.4)
    assert.equal(parsed.problem, null, 'e a fatura fecha')
  })
})

describe('a trava do total confere a MESMA grandeza que o parser produz', () => {
  it('soma que não bate vira problema declarado, com os dois números', async () => {
    // O parser não lança: ele devolve o problema, e o pipeline o põe no relatório. Uma fatura
    // lida pela metade entraria calada, e o mês apareceria mais barato do que foi.
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['05 JAN MERCADO X 100,00', TOTAL('150,00')])
    assert.match(parsed.problem ?? '', /100\.00/)
    assert.match(parsed.problem ?? '', /150\.00/)
  })

  it('`Outros lançamentos` entra na conta', async () => {
    // A identidade é `compras + outros = soma dos débitos`. Sem o segundo termo, toda fatura com
    // anuidade ou IOF acusaria diferença — e o aviso viraria ruído que se aprende a ignorar.
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['05 JAN MERCADO X 100,00', '06 JAN IOF 5,00', TOTAL('100,00'), 'Outros lançamentos R$ 5,00'])
    assert.equal(parsed.problem, null)
  })

  it('e fatura sem "Total de compras" avisa que não deu para conferir', async () => {
    // Silêncio aqui seria pior que o aviso: a leitura pode estar certa, mas ninguém sabe.
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', ['05 JAN MERCADO X 100,00'])
    assert.match(parsed.problem ?? '', /não foi possível conferir/)
  })

  it('o vencimento vem do NOME do arquivo', async () => {
    const parsed = await invoice('docs/fatura/nubank/2026-02-10.pdf', [TOTAL('0,00')])
    assert.equal(parsed.invoiceDueDate, '2026-02-10')
    assert.equal(parsed.accountType, 'credit-card')
    assert.equal(parsed.kind, 'invoice')
  })
})

/**
 * O ANO que vem do RELÓGIO — a escapatória de determinismo que restou no ingest.
 *
 * O `pipeline.ts` injeta `now` por decisão registrada: "`meta.generatedAt` saía de `new Date()`
 * dentro do pipeline, e isso tornava a saída" diferente a cada rodada. `pipeline.test.ts` prende a
 * promessa — "o mesmo `docs/` produz o mesmo resultado". Este parser tem uma porta que escapa dela.
 *
 * Quando o nome do arquivo não traz `AAAA-MM-DD`, o ano do vencimento vem de
 * `new Date().getFullYear()`. Não estoura, e o efeito não aparece na fatura: aparece no MÊS em que
 * cada compra cai. Uma fatura de 2026 lida em 2027 põe os lançamentos um ano à frente — e a mesma
 * pasta, lida em dois anos diferentes, produz dois conjuntos distintos.
 *
 * Preso como está, e não consertado: o conserto é passar `now` até aqui, o que muda a assinatura de
 * uma função pública e é decisão do dono do módulo. Registrado em "Débitos em aberto".
 */
describe('a fatura sem data no NOME', () => {
  it('tira o ano do RELÓGIO DE PAREDE, e nada acusa', async () => {
    // A asserção é comparada contra o relógio de propósito: ela diz que a saída DEPENDE dele, que é
    // exatamente o defeito. Um valor fixo aqui passaria a falhar na virada do ano e pareceria
    // flaky, quando o que estaria falando é o próprio problema.
    //
    // Escrevi antes que a compra de JAN cairia no ano SEGUINTE, pela regra de virada — e errei: o
    // `dueMonth` cai em 12, e JAN numa fatura que vence em dezembro é janeiro do MESMO ano. A regra
    // de virada está certa; o que é inventado é o ano sobre o qual ela opera.
    const parsed = await invoice('docs/fatura/nubank/fatura.pdf', ['05 JAN MERCADO X 123,45', TOTAL('123,45')])

    assert.equal(parsed.transactions[0].postedDate.slice(0, 4), String(new Date().getFullYear()), 'o ano da compra é o ano em que o ingest RODOU')
    assert.equal(parsed.problem, null, 'e a fatura fecha: nada acusa a data inventada')
  })

  it('enquanto a fatura COM data no nome não depende do relógio', async () => {
    // O contraste que dá sentido ao caso acima: com a data no nome, o resultado é o mesmo em
    // qualquer ano — que é o que o projeto inteiro promete.
    const parsed = await invoice('docs/fatura/nubank/2026-03-10.pdf', ['05 FEV MERCADO X 123,45', TOTAL('123,45')])
    assert.equal(parsed.transactions[0].postedDate, '2026-02-05')
  })
})
