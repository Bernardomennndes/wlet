import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Plan, PlannedEntry, Receivable } from '@wlet/domain'
import { setDataset, setDeclarations } from '@/lib/dataset'
import type { ViewTransaction } from '@/lib/finance'

/**
 * A PREVISÃO montada — o que `committed.test.ts` deixou de fora.
 *
 * Aquele arquivo cobriu as parcelas já contratadas, que são fato. Aqui está o resto: como fato,
 * declaração, plano, rubrica e abatimento se combinam num número só. A regra que decide tudo não é
 * a soma, é a ORDEM — e ela é invisível no resultado: trocá-la não estoura nada, só projeta a mais.
 *
 * O portão de boot é semeado antes do import dinâmico pela razão registrada em `committed.test.ts`,
 * mas aqui ele carrega conteúdo: `BUDGET` é lido na avaliação de `budget.ts`, então a rubrica que
 * estes testes exercitam TEM de estar posta antes do `import`. Uma rubrica só, para os números
 * ficarem conferíveis a olho — ela fala em TODO mês, e some de vista se houver várias.
 */
const RUBRIC = 500

/**
 * A cobrança vive nos DOIS lugares de propósito.
 *
 * `expenseByCategory` e `forecastItems` leem a lista que recebem; a conciliação — quanto desta
 * ocorrência já foi pago — vem de `settle`, que lê a lista do MÓDULO. É a mesma cobrança vista de
 * dois ângulos, e é isso que o teste do mês em curso precisa para existir.
 */
const RATEIO: Receivable = {
  id: 'r-1',
  debtor: 'Contraparte',
  label: 'Metade do aluguel',
  amount: 700,
  dueOn: { kind: 'day', day: 10 },
  recurrence: 'monthly',
  startMonth: '2026-01',
  match: { merchants: ['CONTRAPARTE'] },
  offsetsCategoryId: 'moradia',
}

setDataset({ transactions: [], accounts: [], transfers: [], investments: null, meta: { months: [] } } as never)
setDeclarations({
  planned: [],
  budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [{ categoryId: 'viagens', amount: RUBRIC }] },
  receivables: [RATEIO],
  goals: [],
  accounts: [],
  rules: [],
  selfNamePatterns: [],
} as never)

const { buildCategoryForecast, buildForecast, forecastItems, pendingFor } = await import('@/lib/forecast')

const MONTH = '2026-04'

const tx = (over: Partial<ViewTransaction> & { month: string; amount: number }): ViewTransaction =>
  ({
    id: `${over.month}-${over.amount}-${over.merchant ?? 'LOJA'}`,
    date: `${over.month}-05`,
    merchant: over.merchant ?? 'LOJA',
    rawDescription: over.merchant ?? 'LOJA',
    accountId: 'cartao-1',
    categoryId: 'compras',
    displayCategoryId: 'compras',
    flow: 'expense',
    receivableId: null,
    plannedId: null,
    ...over,
  }) as ViewTransaction

/** Uma compra parcelada vista em março: sobram parcelas, e a de abril é a que interessa. */
const bought = (amount: number, categoryId: string, total = 3) =>
  tx({ month: '2026-03', amount: -amount, categoryId, displayCategoryId: categoryId, installment: { current: 1, total }, invoice: { month: '2026-03' } } as never)

const declared = (over: Partial<PlannedEntry> = {}): PlannedEntry =>
  ({ id: 'p-1', kind: 'expense', label: 'Aluguel', amount: 1500, categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01', ...over }) as PlannedEntry

const planned = (over: Partial<Plan> = {}): Plan => ({ id: 'plan-1', label: 'Viagem', categoryId: 'viagens', cash: 800, payment: 'cash', status: 'decided', month: MONTH, ...over }) as Plan

type Input = Parameters<typeof buildForecast>[0]
const input = (over: Partial<Input> = {}): Input => ({ history: [], planned: [], receivables: [], targets: [MONTH], ...over })
const april = (over: Partial<Input> = {}) => buildForecast(input(over))[0]

describe('a rubrica é PISO, e não uma parcela a somar', () => {
  it('a parcela já contratada CONSOME a rubrica da própria categoria', () => {
    // A regra que o módulo escreve com o número que custou: a parcela do Airbnb já é viagem, e a
    // rubrica de viagem não a acrescenta. Somar contaria o mesmo gasto duas vezes, e o mês
    // apareceria R$ 300,00 mais caro sem nada na tela explicando de onde veio.
    const month = april({ history: [bought(300, 'viagens')] })
    assert.equal(month.sources.committed, 300)
    assert.equal(month.sources.rubric, 200, 'a rubrica acrescenta só o que falta para o piso')
    assert.equal(month.expense, RUBRIC, 'quinhentos, não oitocentos')
  })

  it('e o que PASSA do piso manda: a rubrica não entra', () => {
    const month = april({ history: [bought(900, 'viagens')] })
    assert.equal(month.sources.rubric, 0)
    assert.equal(month.expense, 900)
  })

  it('a origem `rubrica` conta só o que ela ACRESCENTA', () => {
    // Sem isso a abertura por origem deixaria de fechar com o total: a parte do piso já coberta
    // por parcela pertence ao `contratado`, e contá-la nas duas somaria 800 num mês de 500.
    const { sources } = april({ history: [bought(300, 'viagens')] })
    assert.equal(sources.committed + sources.rubric, RUBRIC)
  })
})

describe('o plano entra ANTES do piso da rubrica', () => {
  it('uma viagem de R$ 800 numa rubrica de R$ 500 projeta 800, não 1.300', () => {
    const month = april({ plans: [planned()] })
    assert.equal(month.sources.plan, 800)
    assert.equal(month.sources.rubric, 0)
    assert.equal(month.expense, 800)
  })

  it('e um plano MENOR que o piso não some — ele vira parte dele', () => {
    // É este caso que separa a ordem certa da errada, e o anterior não separa: com o plano em 800
    // o piso não teria o que acrescentar de qualquer jeito. Com 200, a ordem aparece — antes da
    // rubrica dá 500 (o piso, do qual o plano é parte); depois dela daria 700.
    const month = april({ plans: [planned({ cash: 200 })] })
    assert.equal(month.sources.plan, 200)
    assert.equal(month.sources.rubric, 300, 'a rubrica completa o piso, não soma sobre o plano')
    assert.equal(month.expense, RUBRIC, 'quinhentos, não setecentos')
  })

  it('plano sem mês não cai em mês nenhum', () => {
    assert.equal(april({ plans: [planned({ month: undefined })] }).sources.plan, 0)
  })
})

describe('o abatimento entra por ÚLTIMO, sobre o valor já formado', () => {
  it('a cobrança reduz a categoria que ela abate', () => {
    // Sem ele o aluguel projetaria R$ 1.500 cheios enquanto metade volta todo mês.
    const month = april({ planned: [declared()], receivables: [RATEIO] })
    assert.equal(month.sources.offset, -700)
    assert.equal(month.expense, RUBRIC + 800, 'a moradia entra pelo custo real')
  })

  it('e NUNCA deixa a categoria negativa', () => {
    // "Gastei menos zero" não é leitura que uma barra saiba desenhar — e o excesso viraria crédito
    // silencioso no total do mês, barateando categorias que não têm nada a ver com a cobrança.
    const month = april({ planned: [declared()], receivables: [{ ...RATEIO, amount: 2000 }] })
    assert.equal(month.sources.offset, -1500, 'abate o que existe, não o que foi declarado')
    assert.equal(month.expense, RUBRIC)
  })

  it('cobrança sobre categoria sem despesa não abate nada', () => {
    const month = april({ planned: [declared()], receivables: [{ ...RATEIO, offsetsCategoryId: 'pets' }] })
    assert.equal(month.sources.offset, 0)
    assert.equal(month.expense, RUBRIC + 1500)
  })
})

describe('as cinco origens SOMAM o total — é isso que torna o número conferível', () => {
  const all = { history: [bought(300, 'viagens')], planned: [declared()], plans: [planned({ cash: 200 })], receivables: [RATEIO] }

  it('com as cinco no mesmo mês', () => {
    const { sources, expense } = april(all)
    assert.deepEqual(sources, { declared: 1500, committed: 300, plan: 200, rubric: 0, offset: -700 })
    assert.equal(sources.declared + sources.committed + sources.plan + sources.rubric + sources.offset, expense)
  })

  it('a entrada vem SÓ das regras declaradas — parcela contratada não é entrada', () => {
    const month = april({ ...all, planned: [declared(), declared({ id: 'p-2', kind: 'income', label: 'Pró-labore', amount: 5000, categoryId: 'renda-pf' })] })
    assert.equal(month.income, 5000)
    assert.equal(month.net, month.income - month.expense)
  })

  it('com rubrica cadastrada, nenhum mês fica VAZIO', () => {
    // Fica escrito porque `empty` é lido na tela como "nada a mostrar aqui": com uma rubrica viva
    // ele nunca é verdadeiro, e o mês sem nada declarado aparece com o piso — que é o certo, mas
    // não é o que o nome do campo sugere a quem o lê pela primeira vez.
    const month = april()
    assert.equal(month.empty, false)
    assert.equal(month.expense, RUBRIC)
  })

  it('sem meses pedidos não há previsão', () => {
    assert.deepEqual(buildForecast(input({ targets: [] })), [])
    assert.deepEqual(buildCategoryForecast(input({ targets: [] })), {})
  })
})

describe('a abertura por categoria FECHA com o total do mês', () => {
  const all = { history: [bought(300, 'viagens')], planned: [declared()], plans: [planned({ cash: 200 })], receivables: [RATEIO] }

  it('a soma das categorias é a saída do mês', () => {
    // As duas contas nascem da mesma função de propósito. Se divergirem, o empilhado da página de
    // Categorias contradiz a linha da Previsão, e nenhuma das duas telas sabe qual está certa.
    const byCategory = buildCategoryForecast(input(all))
    const total = Object.values(byCategory).reduce((sum, months) => sum + (months[MONTH] ?? 0), 0)
    assert.equal(total, april(all).expense)
  })

  it('categoria zerada pelo abatimento não aparece', () => {
    const byCategory = buildCategoryForecast(input({ planned: [declared()], receivables: [{ ...RATEIO, amount: 2000 }] }))
    assert.equal(byCategory.moradia, undefined, 'zero não é dado de empilhado — é uma faixa de altura nenhuma com legenda')
    assert.deepEqual(byCategory.viagens, { [MONTH]: RUBRIC })
  })
})

describe('a agenda do mês, item a item', () => {
  it('a soma dos itens fecha com o total que o gráfico desenha', () => {
    // A gaveta não pode contradizer a linha que a abriu. São dois caminhos de código para a mesma
    // ordem — fato, declarado, plano, piso, abatimento —, e este teste é o que os mantém juntos.
    const all = { history: [bought(300, 'viagens')], planned: [declared()], plans: [planned({ cash: 200 })], receivables: [RATEIO] }
    const total = forecastItems(input(all), MONTH).reduce((sum, item) => sum - item.amount, 0)
    assert.equal(total, april(all).expense)
  })

  it('quem tem dia vem primeiro, na ordem do mês; quem não tem vai para o fim, do maior ao menor', () => {
    // Parcela cai na fatura, cuja data depende do fechamento; rubrica não tem dia nenhum. Ordenar
    // tudo por valor perderia a leitura de agenda, e inventar uma data para a rubrica seria
    // inventar precisão que o dado não tem.
    const items = forecastItems(
      input({
        history: [bought(300, 'viagens')],
        planned: [declared({ id: 'p-fim', amount: 100, dueOn: { kind: 'day', day: 25 } }), declared({ id: 'p-inicio', amount: 900, dueOn: { kind: 'day', day: 5 } })],
      }),
      MONTH,
    )
    assert.deepEqual(
      items.map((item) => item.origin),
      ['declared', 'declared', 'committed', 'rubric'],
    )
    assert.deepEqual(
      items.slice(0, 2).map((item) => item.date),
      ['2026-04-05', '2026-04-25'],
      'por dia, e não pelo valor — 900 antes de 100 aqui é coincidência da data',
    )
  })

  it('duas compras do mesmo estabelecimento no mesmo mês têm chaves distintas', () => {
    // A chave repetida quebraria a lista — o React descartaria uma das duas linhas, e o item
    // sumiria da gaveta enquanto continuaria dentro do total.
    const items = forecastItems(input({ history: [bought(100, 'compras', 3), bought(200, 'compras', 6)] }), MONTH).filter((item) => item.origin === 'committed')
    assert.equal(items.length, 2, 'as duas projetam')
    assert.equal(new Set(items.map((item) => item.key)).size, 2)
  })
})

describe('o mês EM CURSO: só o que ainda vence, e sem rubrica', () => {
  const CUT = '2026-04-10'

  it('a rubrica NÃO entra num mês que já tem extrato', () => {
    // Ali ela não é algo a acontecer: é um teto sendo consumido pelo que já foi gasto. Somá-la ao
    // que ainda vence cobraria de novo o mês inteiro no dia 10.
    //
    // O plano é de R$ 200, ABAIXO do piso, e essa escolha é o teste. Com os R$ 800 que escrevi
    // primeiro ele passava pelo motivo errado: o plano sozinho já superava a rubrica, então ela não
    // teria o que acrescentar nem no mês futuro — desligar a guarda não mudava nada.
    const origins = forecastItems(input({ plans: [planned({ cash: 200 })] }), MONTH, CUT).map((item) => item.origin)
    assert.ok(!origins.includes('rubric'), 'nenhuma rubrica no mês em curso')
    assert.ok(origins.includes('plan'), 'o plano entra: é compra que ainda vai acontecer')
  })

  it('a regra que já venceu fica de fora, e a que ainda vence entra', () => {
    const items = forecastItems(input({ planned: [declared({ id: 'p-venceu', dueOn: { kind: 'day', day: 5 } }), declared({ id: 'p-vence', dueOn: { kind: 'day', day: 25 } })] }), MONTH, CUT)
    assert.deepEqual(
      items.map((item) => item.key),
      ['declared-p-vence'],
    )
  })

  it('regra SEM dia declarado não entra — não há como saber se já aconteceu', () => {
    assert.deepEqual(forecastItems(input({ planned: [declared()] }), MONTH, CUT), [])
  })

  it('o rateio já recebido não é cobrado de novo', () => {
    // Vem da CONCILIAÇÃO e não de uma soma do mês. A agenda já cobrou um rateio que o pagador
    // tinha adiantado, e o erro é do tipo que ninguém confere: o número continua plausível.
    const pago = tx({ month: MONTH, amount: 350, date: '2026-04-03', merchant: 'CONTRAPARTE', flow: 'income', receivableId: RATEIO.id } as never)
    const items = forecastItems(input({ history: [pago], planned: [declared({ dueOn: { kind: 'day', day: 25 } })], receivables: [RATEIO] }), MONTH, '2026-04-05')
    const offset = items.find((item) => item.origin === 'offset')
    assert.equal(offset?.amount, 350, 'só a metade que falta — não os 700 da ocorrência inteira')
  })
})

describe('o que ainda vence, somado', () => {
  it('a parcela contratada NÃO entra: quem chama a soma à parte', () => {
    // Ela está na agenda porque é fato do mês, e `committedFor` já a devolve para o mesmo mês.
    // Contá-la aqui também dobraria a saída prevista do mês em curso.
    const pending = pendingFor(
      input({
        history: [bought(300, 'viagens')],
        planned: [declared({ dueOn: { kind: 'day', day: 25 } }), declared({ id: 'p-2', kind: 'income', label: 'Pró-labore', amount: 5000, categoryId: 'renda-pf', dueOn: { kind: 'day', day: 20 } })],
      }),
      MONTH,
      '2026-04-10',
    )
    assert.equal(pending.income, 5000)
    assert.equal(pending.expense, 1500, 'mil e quinhentos, não mil e oitocentos')
    assert.equal(pending.byCategory.get('moradia'), 1500)
  })

  it('o abatimento é crédito na despesa, e não entrada', () => {
    const pago = input({ planned: [declared({ dueOn: { kind: 'day', day: 25 } })], receivables: [RATEIO] })
    const pending = pendingFor(pago, MONTH, '2026-04-05')
    assert.equal(pending.income, 0, 'rateio recebido não é renda — é aluguel mais barato')
    assert.equal(pending.expense, 800)
  })
})

describe('plano LIGADO a uma compra não é previsão', () => {
  // A compra de 3× comprada em março tem a parcela de abril no contratado. Um plano decidido que
  // descreve a MESMA compra somava de novo — o defeito que o vínculo existe para consertar.
  const purchase = () => bought(100, 'compras', 3)
  const samePurchasePlan = (over: Partial<Plan> = {}) => planned({ label: 'Compra parcelada', categoryId: 'compras', cash: 100, month: MONTH, ...over })

  it('sem vínculo o mês soma o mesmo dinheiro duas vezes — é o defeito documentado', () => {
    const month = april({ history: [purchase()], plans: [samePurchasePlan()] })
    assert.equal(month.sources.committed, 100)
    assert.equal(month.sources.plan, 100)
  })

  it('com purchaseId o plano sai da soma, e o contratado continua', () => {
    const month = april({ history: [purchase()], plans: [samePurchasePlan({ purchaseId: 'qualquer-parcela' })] })
    assert.equal(month.sources.committed, 100)
    assert.equal(month.sources.plan, 0)
  })

  it('e a agenda do mês não lista o plano ligado', () => {
    const items = forecastItems(input({ history: [purchase()], plans: [samePurchasePlan({ purchaseId: 'qualquer-parcela' })] }), MONTH)
    assert.equal(items.filter((item) => item.origin === 'plan').length, 0)
    assert.equal(items.filter((item) => item.origin === 'committed').length, 1)
  })
})

/**
 * AS BORDAS DO RATEIO, e a ORDEM em que a agenda se lê.
 *
 * O abatimento é a última origem a entrar, e a única que SUBTRAI. Isso a torna a mais fácil de
 * errar em silêncio: um rateio a mais some com uma despesa que existe, e um rateio a menos deixa o
 * mês parecendo mais caro — os dois produzem um total plausível, porque o que muda é o quanto e não
 * a forma.
 *
 * A ordenação vem junto porque é o mesmo assunto visto pela tela: a agenda é lida de cima para
 * baixo, e o que o código escolhe pôr primeiro é o que a pessoa lê primeiro.
 */
describe('o rateio não pode abater mais do que existe', () => {
  it('rateio MAIOR que a despesa abate só até zerá-la, na AGENDA', () => {
    // Há DOIS limitadores no módulo, um em cada função, e cada um precisa do seu teste porque são
    // códigos separados: `expenseByCategory` (linha 253) e `forecastItems` (linha 431). O primeiro
    // já tinha dois testes; a falsificação mostrou que este caso, escrito contra `buildForecast`,
    // duplicava aqueles e deixava o da agenda descoberto.
    //
    // Sem o `Math.min`, o item de rateio sairia com os R$ 9.000 inteiros — uma linha de "Rateio ·
    // Contraparte" maior que a despesa que ela abate, e o somatório da agenda viraria positivo.
    const grande: Receivable = { ...RATEIO, id: 'r-grande', amount: 9000 }
    const items = forecastItems(input({ planned: [declared({ amount: 1500 })], receivables: [grande] }), MONTH)
    const offset = items.find((item) => item.origin === 'offset')

    assert.equal(offset?.amount, 1500, 'abate os mil e quinhentos, não os nove mil')
  })

  it('e rateio sobre categoria SEM despesa nenhuma não vira item na agenda', () => {
    // `if (applied <= 0) continue`. Uma linha de "Rateio · Fulano" com valor zero ocuparia espaço
    // na agenda dizendo que nada acontece — e a agenda existe para listar o que acontece.
    const orfao: Receivable = { ...RATEIO, id: 'r-orfao', offsetsCategoryId: 'tecnologia' }
    const items = forecastItems(input({ planned: [declared()], receivables: [orfao] }), MONTH)

    assert.deepEqual(
      items.filter((item) => item.origin === 'offset'),
      [],
    )
  })

  it('rateio SEM dia declarado fica de fora do mês em curso', () => {
    // Mesma razão da regra declarada sem dia, do bloco acima: sem dia não há como saber se ele já
    // veio. Incluí-lo abateria uma despesa com dinheiro que talvez já tenha entrado — e aí o
    // abatimento conta duas vezes, uma no extrato e outra na previsão.
    const semDia = { ...RATEIO, id: 'r-sem-dia', dueOn: undefined } as unknown as Receivable
    const items = forecastItems(input({ planned: [declared({ dueOn: { kind: 'day', day: 25 } })], receivables: [semDia] }), MONTH, '2026-04-05')

    assert.deepEqual(
      items.filter((item) => item.origin === 'offset'),
      [],
      'nenhum abatimento sem dia',
    )
    assert.ok(
      items.some((item) => item.origin === 'declared'),
      'e a despesa continua lá, inteira',
    )
  })
})

/**
 * `pendingAfter` é OPCIONAL, e `null` não é o mesmo que ausente.
 *
 * `const partial = pendingAfter !== undefined` — passar `null` LIGA o mês em curso, com uma data de
 * corte nula, e aí nada vence. Escrevi `null` pensando em "mês futuro" e a agenda voltou vazia nos
 * três testes. Para o mês futuro o argumento se OMITE.
 */
describe('a agenda se lê de cima para baixo, e a ordem é escolhida', () => {
  it('o que tem DIA vem antes do que não tem', () => {
    // "Fingir uma data ali seria inventar precisão que o dado não tem": parcela cai na fatura, cuja
    // data depende do fechamento, e rubrica não tem dia nenhum. Eles vão para o fim em vez de para
    // o dia 1º, que é onde um `?? ''` os poria.
    const items = forecastItems(input({ planned: [declared({ dueOn: { kind: 'day', day: 20 } })], plans: [planned()] } as never), MONTH)
    const semData = items.findIndex((item) => item.date === null)
    const comData = items.findIndex((item) => item.date !== null)

    assert.notEqual(comData, -1)
    assert.notEqual(semData, -1)
    assert.ok(comData < semData, 'o datado primeiro')
  })

  it('e no MESMO dia, o de maior valor vem primeiro', () => {
    // Empate de data resolve pelo módulo do valor. É o que faz o aluguel aparecer acima da conta de
    // luz quando as duas vencem no dia 10 — a ordem alfabética ou a de inserção poria a menor em
    // cima, e quem abre a agenda procura primeiro o que pesa.
    const items = forecastItems(
      input({
        planned: [
          declared({ id: 'p-pequeno', label: 'Luz', amount: 120, categoryId: 'utilidades', dueOn: { kind: 'day', day: 10 } }),
          declared({ id: 'p-grande', label: 'Aluguel', amount: 1500, dueOn: { kind: 'day', day: 10 } }),
        ],
      }),
      MONTH,
    )

    // A rubrica entra junto e vai para o FIM, por não ter dia — o que prende as duas regras de
    // ordenação numa asserção só.
    assert.deepEqual(
      items.map((item) => item.key),
      ['declared-p-grande', 'declared-p-pequeno', 'rubric-viagens'],
    )
  })
})
