import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Account, Transaction } from '@wlet/domain'
import { setDataset, setDeclarations } from '@/lib/dataset'

/**
 * A LEITURA do dinheiro — o módulo por onde passa todo número que a tela mostra.
 *
 * `finance.ts` tem 332 linhas e não tinha teste nenhum, e é ele que responde às perguntas de que
 * todo o resto depende: isto é entrada ou saída? em que categoria aparece? quanto foi o mês?
 *
 * O modo de falha aqui é o pior do app, e está escrito no próprio módulo: **o reembolso somado
 * como entrada deixa o RESULTADO do mês certo e os dois números errados**. Entrada e saída
 * inflam na mesma medida, a diferença continua batendo, e nada na tela denuncia — o mês parece
 * movimentar o dobro do que movimentou. É esse tipo de erro que estes testes existem para pegar.
 *
 * O portão de boot é semeado antes do import dinâmico: `finance.ts` lê `dataset()` na avaliação,
 * e `displayCategoryId` chega em `receivables.ts`, que lê `declarations()`. Os dois precisam estar
 * postos antes — é o custo declarado da decisão do portão, e são três linhas.
 */
const account = (id: string, entity: 'PF' | 'PJ', to?: string): Account =>
  ({
    id,
    name: id,
    bank: 'Banco',
    bankCode: '000',
    type: 'checking',
    entity,
    holder: 'Titular',
    externalId: id,
    coverage: to ? { from: '2026-07-01', to } : null,
    reportedBalance: null,
    sources: [],
    transactionCount: 0,
  }) as Account

const ACCOUNTS = [account('pf-checking', 'PF', '2026-09-02'), account('pf-cartao', 'PF', '2026-08-28'), account('pj-checking', 'PJ', '2026-08-30')]

const RENT = {
  id: 'r-1',
  debtor: 'Contraparte',
  label: 'Metade do aluguel',
  amount: 750,
  dueOn: { kind: 'day', day: 10 },
  recurrence: 'monthly',
  startMonth: '2026-01',
  match: { merchants: ['CONTRAPARTE'] },
  offsetsCategoryId: 'moradia',
}

/**
 * O conjunto que `selectTransactions` lê é o do MÓDULO, e é por isso que ele é semeado aqui e
 * não passado por parâmetro — a seleção é justamente a função que junta recorte, período e
 * ajuste manual sobre o conjunto inteiro.
 */
const SEED: Transaction[] = [
  { id: 'a', accountId: 'pf-checking', date: '2026-08-10', amount: -1500, merchant: 'IMOBILIARIA', categoryId: 'moradia' },
  { id: 'b', accountId: 'pj-checking', date: '2026-08-11', amount: -900, merchant: 'CLOUD', categoryId: 'tecnologia' },
  { id: 'c', accountId: 'pf-checking', date: '2026-09-01', amount: -80, merchant: 'MERCADO', categoryId: 'mercado' },
].map((tx) => ({ transferKind: null, counterpartAccountId: null, receivableId: null, plannedId: null, ...tx }) as never)

setDataset({ transactions: SEED, accounts: ACCOUNTS, transfers: [], investments: null, meta: { months: ['2026-07', '2026-08', '2026-09'] } } as never)
setDeclarations({ planned: [], budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, receivables: [RENT], goals: [], accounts: [], rules: [], selfNamePatterns: [] } as never)

const finance = await import('@/lib/finance')
const {
  accountInScope,
  detectRecurring,
  displayCategoryId,
  flowOf,
  lastCompleteMonth,
  lastDateWithData,
  monthsBetween,
  selectTransactions,
  summarizeByCategory,
  summarizeByMerchant,
  summarizeByMonth,
  toCents,
} = finance

const tx = (over: Partial<Transaction> & { amount: number }): Transaction =>
  ({
    id: `${over.accountId ?? 'pf-checking'}-${over.amount}-${over.date ?? ''}`,
    accountId: 'pf-checking',
    date: '2026-08-10',
    postedDate: '2026-08-10',
    merchant: 'LOJA',
    description: 'LOJA',
    rawDescription: 'LOJA',
    kind: 'statement',
    categoryId: 'compras',
    categoryRule: null,
    installment: null,
    invoice: null,
    transferId: null,
    transferKind: null,
    counterpartAccountId: null,
    receivableId: null,
    plannedId: null,
    source: 'teste.ofx',
    fitId: null,
    ...over,
  }) as Transaction

/** Já com fluxo e categoria resolvidos, como `selectTransactions` entrega. */
const view = (over: Partial<Transaction> & { amount: number }, scope: 'all' | 'PF' | 'PJ' = 'all') => {
  const base = tx(over)
  return { ...base, flow: flowOf(base, scope), displayCategoryId: displayCategoryId(base, scope), month: base.date.slice(0, 7) } as never
}

describe('o fluxo depende do RECORTE, e é essa a razão de a função receber um', () => {
  it('a transferência entre duas contas do mesmo recorte é NEUTRA', () => {
    const between = tx({ amount: -2000, transferKind: 'internal', counterpartAccountId: 'pf-cartao' })
    assert.equal(flowOf(between, 'all'), 'transfer')
    assert.equal(flowOf(between, 'PF'), 'transfer', 'as duas pontas são PF: o dinheiro não saiu de você')
  })

  it('a retirada da PJ é DESPESA na visão PJ e RENDA na visão PF', () => {
    // O mesmo dinheiro, duas leituras — e as duas certas. Na PJ ele saiu da empresa; na PF ele
    // entrou. É por isso que o fluxo não pode ser um campo gravado no lançamento.
    const out = tx({ accountId: 'pj-checking', amount: -2000, transferKind: 'internal', counterpartAccountId: 'pf-checking' })
    const back = tx({ accountId: 'pf-checking', amount: 2000, transferKind: 'internal', counterpartAccountId: 'pj-checking' })
    assert.equal(flowOf(out, 'PJ'), 'expense')
    assert.equal(flowOf(back, 'PF'), 'income')
    assert.equal(flowOf(out, 'all'), 'transfer', 'no consolidado ela volta a ser mudança de bolso')
  })

  it('transferência sem contraparte conhecida é neutra em TODO recorte', () => {
    // O `unmatched-self` do ingest: parece transferência própria e não achou o outro lado.
    //
    // Fica dito o que a mutação mostrou: as DUAS guardas de `flowOf` devolvem neutra aqui, e
    // nenhum estado que o ingest produz as separa — ele só marca `unmatched-self` quando não há
    // `transferId`, e `counterpartAccountId` só é escrito junto com um. A primeira guarda é
    // redundante com a segunda hoje; ela é a que sobrevive se um dia a contraparte for adivinhada.
    const loose = tx({ amount: -300, transferKind: 'unmatched-self' })
    assert.equal(flowOf(loose, 'PF'), 'transfer')
    assert.equal(flowOf(loose, 'PJ'), 'transfer')
  })

  it('o rateio recebido não é renda — é reembolso', () => {
    // Somá-lo como entrada infla os dois lados. Ele abate a despesa que você adiantou.
    const paid = tx({ amount: 750, merchant: 'CONTRAPARTE', categoryId: 'pix-recebido', receivableId: 'r-1' })
    assert.equal(flowOf(paid, 'all'), 'reimbursement')
    assert.equal(flowOf(tx({ amount: 750, categoryId: 'pix-recebido' }), 'all'), 'income', 'sem cobrança casada, entrada é entrada')
  })

  it('conta desconhecida fica FORA do recorte, nunca dentro', () => {
    // Cair para dentro somaria ao recorte um lançamento de conta que ninguém sabe de quem é.
    assert.equal(accountInScope('nao-existe', 'PF'), false)
    assert.equal(accountInScope('nao-existe', 'all'), true, 'o consolidado é o consolidado')
  })
})

describe('a categoria EXIBIDA', () => {
  it('o crédito cai na mesma categoria que ele ABATE', () => {
    // Uma entrada em "Pix de pessoas" não reduz "Moradia" no empilhado nem na BarList: ela
    // apareceria como receita numa categoria e a despesa continuaria cheia na outra.
    const paid = tx({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })
    assert.equal(displayCategoryId(paid, 'all'), 'moradia')
  })

  it('o ajuste manual manda, inclusive sobre o crédito', () => {
    const paid = tx({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })
    assert.equal(displayCategoryId(paid, 'all', 'lazer'), 'lazer')
  })

  it('a retirada ganha nome próprio SÓ na visão em que ela é movimento', () => {
    // No consolidado ela é transferência e mantém a categoria de origem: batizá-la de "Retirada
    // da PJ" ali criaria uma linha de saída num recorte onde nada saiu.
    const back = tx({ accountId: 'pf-checking', amount: 2000, categoryId: 'transferencia', transferKind: 'internal', counterpartAccountId: 'pj-checking' })
    const out = tx({ accountId: 'pj-checking', amount: -2000, categoryId: 'transferencia', transferKind: 'internal', counterpartAccountId: 'pf-checking' })
    assert.equal(displayCategoryId(back, 'PF'), 'retirada-pj')
    assert.equal(displayCategoryId(out, 'PJ'), 'retirada-pf')
    assert.equal(displayCategoryId(back, 'all'), 'transferencia')
  })
})

describe('o resumo do mês', () => {
  const month = ['2026-08']

  it('o reembolso é despesa NEGATIVA, e não entrada', () => {
    // O teste que este arquivo existe para ter. Com o crédito em `income`, o `net` continua
    // -750 e os DOIS números ficam errados: o mês diria que entraram 750 e saíram 1.500.
    const [row] = summarizeByMonth([view({ amount: -1500, categoryId: 'moradia' }), view({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })], month)
    assert.equal(row.income, 0, 'nada entrou: metade do aluguel nunca foi custo seu')
    assert.equal(row.expense, 750)
    assert.equal(row.net, -750)
  })

  it('a transferência não entra em entrada nem saída, mas a saída dela é MEDIDA', () => {
    // `transfersOut` existe para a tela poder dizer quanto girou entre as próprias contas sem
    // que isso vire gasto. Somá-la à saída faria um pagamento de fatura contar duas vezes.
    const [row] = summarizeByMonth([view({ amount: -2000, transferKind: 'internal', counterpartAccountId: 'pf-cartao' })], month)
    assert.deepEqual({ income: row.income, expense: row.expense, transfersOut: row.transfersOut }, { income: 0, expense: 0, transfersOut: 2000 })
  })

  it('mês fora da lista pedida não entra, e o que entra é contado', () => {
    const rows = summarizeByMonth([view({ amount: -100, date: '2026-08-02' }), view({ amount: -100, date: '2026-09-02' })], month)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].count, 1)
  })

  it('mês sem lançamento vem ZERADO, e não ausente', () => {
    // Mês vazio é dado: sumido da série, o gráfico emendaria julho em setembro.
    const rows = summarizeByMonth([], ['2026-07', '2026-08'])
    assert.deepEqual(
      rows.map((row) => row.month),
      ['2026-07', '2026-08'],
    )
  })

  it('os totais saem no MESMO grão em que são exibidos', () => {
    // Somar em ponto flutuante não devolve o número da tela: em fevereiro as duas pontas deram
    // 12973.399999999999636 e 12973.400000000001455, e a razão entre elas pintou o mês de vermelho.
    const [row] = summarizeByMonth(
      Array.from({ length: 11 }, () => view({ amount: -1179.4 })),
      month,
    )
    assert.equal(row.expense, 12973.4)
  })

  it('o resíduo negativo não vira "-R$ 0,00"', () => {
    // `-0` o Intl formata como "-R$ 0,00" e o `< 0` julga falso: negativo no texto e verde na cor.
    assert.equal(Object.is(toCents(-0.001), 0), true)
  })
})

describe('os totais por categoria', () => {
  it('o crédito abate a categoria e NÃO conta como lançamento', () => {
    // "113 despesas em 8 meses" contaria uma entrada — o número de linhas deixaria de ser o
    // número de linhas que a pessoa vê na lista.
    const [row] = summarizeByCategory([view({ amount: -1500, categoryId: 'moradia' }), view({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })], 'expense')
    assert.equal(row.categoryId, 'moradia')
    assert.equal(row.total, 750)
    assert.equal(row.count, 1, 'uma despesa, não duas')
    assert.deepEqual(row.byMonth, { '2026-08': 750 })
  })

  it('trava em zero POR MÊS: o rateio que chega depois não cava um buraco na série', () => {
    // O rateio de agosto pago em setembro. Nem pilha nem barra desenham fatia negativa, e o
    // total do mês continua exato — a diferença aparece como "Outras saídas" menor.
    //
    // É AQUI que a trava trabalha, e a mutação foi quem mostrou: escrito com o crédito sozinho,
    // este teste passava pelo motivo errado. Lá quem descarta a categoria é o `total <= 0` logo
    // abaixo, não o `Math.max` — desligar a trava não mudava nada. A do `total` é, hoje,
    // REDUNDANTE com esse descarte; a do mês não tem substituto.
    const [row] = summarizeByCategory(
      [view({ amount: -1500, date: '2026-08-10', categoryId: 'moradia' }), view({ amount: 750, date: '2026-09-05', categoryId: 'pix-recebido', receivableId: 'r-1' })],
      'expense',
    )
    assert.equal(row.total, 750, 'o total do período é líquido')
    assert.deepEqual(row.byMonth, { '2026-08': 1500, '2026-09': 0 }, 'setembro é zero, e não -750')
  })

  it('crédito sozinho não vira categoria', () => {
    assert.deepEqual(summarizeByCategory([view({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })], 'expense'), [])
  })

  it('a participação soma 1, e a ordem é do maior para o menor', () => {
    const rows = summarizeByCategory([view({ amount: -100, categoryId: 'mercado' }), view({ amount: -300, categoryId: 'moradia' })], 'expense')
    assert.deepEqual(
      rows.map((row) => row.categoryId),
      ['moradia', 'mercado'],
    )
    assert.equal(toCents(rows.reduce((total, row) => total + row.share, 0)), 1)
    assert.equal(rows[0].label, 'Moradia', 'o rótulo vem do vocabulário, não do id')
  })

  it('o eixo de entrada não recebe o crédito', () => {
    // Ele é despesa negativa: aparecer também como receita o contaria duas vezes, com sinal
    // trocado, e os dois eixos da mesma tela discordariam.
    assert.deepEqual(summarizeByCategory([view({ amount: 750, categoryId: 'pix-recebido', receivableId: 'r-1' })], 'income'), [])
  })
})

describe('estabelecimento e recorrência', () => {
  const spread = (merchant: string, months: string[], amount: number) => months.map((month) => view({ amount: -amount, date: `${month}-05`, merchant }))

  it('o estabelecimento acumula meses, ticket médio e a ÚLTIMA data', () => {
    const [row] = summarizeByMerchant([...spread('STREAMING', ['2026-07', '2026-08'], 40), view({ amount: -20, date: '2026-08-20', merchant: 'STREAMING' })])
    assert.equal(row.total, 100)
    assert.equal(row.count, 3)
    assert.deepEqual(row.months, ['2026-07', '2026-08'])
    assert.equal(row.lastDate, '2026-08-20', 'a mais recente, e não a última lida')
    assert.equal(toCents(row.avgTicket), 33.33)
  })

  it('valor idêntico todo mês tem variabilidade ZERO', () => {
    const [row] = detectRecurring(summarizeByMerchant(spread('STREAMING', ['2026-07', '2026-08', '2026-09'], 40)), 3)
    assert.equal(row.variability, 0)
    assert.equal(row.monthlyAverage, 40)
  })

  it('num período CURTO o mínimo encolhe junto', () => {
    // A regra sutil: com dois meses no período, dois meses já é "todo mês". Sem o `Math.min`, um
    // recorte de dois meses não teria assinatura nenhuma — e a tela de recorrentes abriria vazia
    // exatamente quando a pessoa estreita o período para conferir.
    const merchants = summarizeByMerchant(spread('STREAMING', ['2026-07', '2026-08'], 40))
    assert.equal(detectRecurring(merchants, 2).length, 1, 'dois de dois é recorrente')
    assert.equal(detectRecurring(merchants, 6).length, 0, 'dois de seis não é')
  })
})

describe('a régua do tempo', () => {
  it('os meses atravessam a virada do ano', () => {
    assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'])
    assert.deepEqual(monthsBetween('2026-03', '2026-03'), ['2026-03'])
    assert.deepEqual(monthsBetween('2026-05', '2026-04'), [], 'janela invertida não inventa mês')
  })

  it('a última data com dado é a maior COBERTURA, e não hoje', () => {
    // Um recebimento de ontem que ainda não foi exportado continua sendo previsão — ele não
    // está nos dados. Trocar isto pelo relógio faria a previsão encolher sozinha à meia-noite.
    assert.equal(lastDateWithData(), '2026-09-02')
    assert.equal(finance.lastMonthWithData(), '2026-09')
    assert.equal(finance.firstMonthWithData(), '2026-07')
    assert.equal(finance.projectionHorizon(), '2026-12', 'até dezembro do ano do último dado')
  })

  it('o último mês COMPLETO exclui o corrente e o futuro', () => {
    assert.equal(lastCompleteMonth(['2020-01', '2020-02', '2999-01']), '2020-02')
    assert.equal(lastCompleteMonth(['2999-01']), null)
  })
})

describe('a seleção junta recorte, período e ajuste de uma vez', () => {
  it('o recorte corta pela conta, o período pelo mês, e o ajuste troca a categoria', () => {
    const selected = selectTransactions('PF', { from: '2026-08', to: '2026-08' }, { a: 'lazer' })
    assert.deepEqual(
      selected.map((item) => [item.id, item.displayCategoryId, item.flow, item.month]),
      [['a', 'lazer', 'expense', '2026-08']],
      'a PJ sai pelo recorte, setembro sai pelo período, e a moradia virou lazer',
    )
  })

  it('o consolidado traz as duas entidades', () => {
    assert.equal(selectTransactions('all', { from: '2026-08', to: '2026-09' }, {}).length, 3)
  })
})
