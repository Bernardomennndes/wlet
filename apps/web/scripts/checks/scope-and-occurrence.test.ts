import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlannedEntry, Receivable } from '@wlet/domain'
import { setDataset, setDeclarations } from '@/lib/dataset'

/**
 * QUEM entra no recorte, e QUANDO uma regra ainda vai acontecer.
 *
 * Dois módulos pequenos com uma consequência grande: eles decidem o que a PF vê e o que a PJ vê, e
 * o que ainda vence no mês que já tem extrato. Errar o recorte não estoura — mostra a conta do
 * outro lado, ou esconde a sua, e a pessoa toma decisão sobre um número que não é dela.
 *
 * As duas listas moram no conjunto e são lidas na avaliação do módulo, então o portão é semeado
 * com elas antes do import. É o caso raro em que a semente do teste É o dado sob teste.
 */
const rule = (over: Partial<PlannedEntry>): PlannedEntry =>
  ({ id: 'p', kind: 'expense', label: 'Conta', amount: 100, categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01', ...over }) as PlannedEntry

const charge = (over: Partial<Receivable>): Receivable =>
  ({
    id: 'r',
    debtor: 'Alguém',
    label: 'Rateio',
    amount: 100,
    dueOn: { kind: 'day', day: 10 },
    recurrence: 'monthly',
    startMonth: '2026-01',
    match: { merchants: ['X'] },
    offsetsCategoryId: 'moradia',
    ...over,
  }) as Receivable

const PLANEJADAS = [
  rule({ id: 'pf-com-dia', entity: 'PF', dueOn: { kind: 'day', day: 25 } }),
  rule({ id: 'pf-sem-dia', entity: 'PF' }),
  rule({ id: 'pj-com-credor', entity: 'PJ', dueOn: { kind: 'day', day: 5 }, match: { merchants: ['CONTABILIDADE'] } as never }),
  rule({ id: 'pf-parcelada', entity: 'PF', recurrence: 'installments', count: 3, dueOn: { kind: 'day', day: 15 } }),
  rule({ id: 'pf-com-fim', entity: 'PF', endMonth: '2026-06', dueOn: { kind: 'day', day: 15 } }),
]

const COBRANCAS = [
  charge({ id: 'com-conta-pf', match: { merchants: ['X'], accountId: 'conta-pf' } as never }),
  charge({ id: 'com-conta-pj', match: { merchants: ['Y'], accountId: 'conta-pj' } as never }),
  charge({ id: 'sem-conta' }),
]

setDataset({ transactions: [], accounts: [], transfers: [], meta: { months: [] }, investments: { snapshot: null, series: [], income: [] } } as never)
setDeclarations({ planned: PLANEJADAS, budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, receivables: COBRANCAS, goals: [], accounts: [], rules: [], selfNamePatterns: [] } as never)

const { CONCILIATED, lastOccurrence, pendingIn, plannedInScope, settlePlanned } = await import('@/lib/planned')
const { offsetCategoryOf, receivablesInScope } = await import('@/lib/receivables')

const ids = (list: { id: string }[]) => list.map((item) => item.id).sort()

describe('o recorte das regras declaradas', () => {
  it('o consolidado traz todas; PF e PJ trazem as suas', () => {
    assert.equal(plannedInScope('all').length, PLANEJADAS.length)
    assert.deepEqual(ids(plannedInScope('PJ')), ['pj-com-credor'])
    assert.ok(!ids(plannedInScope('PF')).includes('pj-com-credor'))
  })

  it('só as regras com CREDOR viram conta a pagar', () => {
    // Uma rubrica de gasto não tem credor único, e perguntar se ela foi paga não faz sentido —
    // ela é medida contra o teto, não contra um vencimento. Sem esta separação, a tela de
    // Pagamentos encheria de linhas que nunca saem de "em aberto".
    assert.deepEqual(ids(CONCILIATED), ['pj-com-credor'])
  })
})

describe('o recorte das cobranças é MAIS FROUXO, e de propósito', () => {
  const entidade = (accountId: string) => (accountId === 'conta-pf' ? ('PF' as const) : accountId === 'conta-pj' ? ('PJ' as const) : undefined)

  it('sem conta declarada, a cobrança vale nos DOIS lados', () => {
    // Não dá para dizer de que lado ela é. Escondê-la de ambos sumiria com dinheiro a receber;
    // escolher um lado inventaria uma informação que ninguém deu. Aparecer nos dois é a única
    // leitura honesta — e é a mesma da tela de Cobranças.
    assert.ok(ids(receivablesInScope('PF', entidade)).includes('sem-conta'))
    assert.ok(ids(receivablesInScope('PJ', entidade)).includes('sem-conta'))
  })

  it('com conta declarada, ela fica do lado da conta', () => {
    assert.deepEqual(ids(receivablesInScope('PF', entidade)), ['com-conta-pf', 'sem-conta'])
    assert.deepEqual(ids(receivablesInScope('PJ', entidade)), ['com-conta-pj', 'sem-conta'])
  })

  it('conta desconhecida NÃO cai em nenhum lado específico', () => {
    // Uma conta que o conjunto não conhece devolve `undefined`, que não casa recorte nenhum. Cair
    // para dentro somaria ao recorte um dinheiro de origem que ninguém sabe qual é.
    const semConjunto = () => undefined
    assert.deepEqual(ids(receivablesInScope('PF', semConjunto)), ['sem-conta'])
  })

  it('e o consolidado traz todas', () => {
    assert.equal(receivablesInScope('all', entidade).length, COBRANCAS.length)
  })
})

describe('o que ainda VENCE no mês em curso', () => {
  it('regra sem dia declarado nunca está pendente', () => {
    // É a guarda que autoriza o mês com extrato a receber previsão. Sem dia, um "todo mês entra
    // tal valor" recontaria o que já aconteceu — e o mês fecharia com o dobro.
    assert.equal(pendingIn(PLANEJADAS[1], '2026-03', '2026-03-10'), false)
  })

  it('com dia, vence depois do corte e não antes', () => {
    const dia25 = PLANEJADAS[0]
    assert.equal(pendingIn(dia25, '2026-03', '2026-03-10'), true, 'o dia 25 ainda vem')
    assert.equal(pendingIn(dia25, '2026-03', '2026-03-25'), false, 'no próprio dia já aconteceu')
    assert.equal(pendingIn(dia25, '2026-03', '2026-03-31'), false)
  })

  it('e mês em que a regra não incide não pende', () => {
    assert.equal(pendingIn(PLANEJADAS[4], '2026-09', '2026-09-01'), false, 'a regra terminou em junho')
  })
})

describe('até onde a previsão desenha', () => {
  it('uma parcelada sabe o próprio fim, e ele pode estar no FUTURO', () => {
    // As parcelas que ainda vão vencer precisam aparecer, senão a tela mostraria uma dívida
    // quitada. Três parcelas a partir de janeiro terminam em março.
    assert.equal(lastOccurrence(PLANEJADAS[3]), '2026-03')
  })

  it('uma mensal COM prazo termina no prazo; sem prazo, não termina', () => {
    // `null` é "não há como saber onde ela acaba" — e quem chama estica até o último mês com
    // dado. Devolver um mês qualquer ali inventaria um fim.
    assert.equal(lastOccurrence(PLANEJADAS[4]), '2026-06')
    assert.equal(lastOccurrence(PLANEJADAS[1]), null)
  })

  it('uma de uma vez só termina onde começa', () => {
    assert.equal(lastOccurrence(rule({ recurrence: 'once', startMonth: '2026-04' })), '2026-04')
  })
})

describe('a categoria que um recebimento abate', () => {
  it('sai da cobrança casada, e não do lançamento', () => {
    // O crédito precisa cair na MESMA categoria que ele abate, senão não anula nada: uma entrada
    // em "Pix de pessoas" não reduz "Moradia" no empilhado nem na barra.
    assert.equal(offsetCategoryOf('sem-conta'), 'moradia')
  })

  it('sem cobrança casada, não abate nada', () => {
    assert.equal(offsetCategoryOf(null), null)
    assert.equal(offsetCategoryOf('cobranca-que-nao-existe'), null)
  })
})

/**
 * `settlePlanned` — a conciliação dos lançamentos previstos, sem teste nenhum até aqui.
 *
 * É o que responde "o aluguel de março está pago?" para a agenda de Pagamentos e para o mês em
 * curso da Previsão. Ela não faz a conciliação: delega ao `settleAll`, que tem bateria própria. O
 * que é DELA são três decisões de fronteira, e as três estavam descobertas.
 *
 * O modo de falha é o mesmo do módulo inteiro e por isso vale repeti-lo: um casamento a menos não
 * estoura — a tela diz que nove meses de aluguel estão vencidos, num conjunto que paga o aluguel
 * todo mês.
 */
describe('settlePlanned: as três decisões de fronteira', () => {
  const paid = (month: string, amount: number, plannedId: string | null) => ({ id: `t-${month}-${plannedId}`, amount, date: `${month}-25`, month, merchant: 'LOCADORA', plannedId })

  /**
   * O id é `pj-com-credor`, e a escolha é o teste.
   *
   * `CONCILIATED` é `PLANNED.filter((entry) => entry.match !== undefined)` — só regra com CREDOR
   * declarado vira conta a pagar. Escrevi os primeiros casos contra `pf-com-dia`, que não tem
   * `match`, e dois falharam; o terceiro PASSOU, porque `settleAll` devolve uma ocorrência por mês
   * da janela mesmo sem casamento nenhum, e eu só conferia `length > 0`. Passar pelo motivo errado
   * é o que uma asserção frouxa compra.
   */
  it('o `kind` filtra as REGRAS, e não os lançamentos', () => {
    // A única regra conciliável do fixture é de DESPESA. Pedir a conciliação das entradas tem de
    // devolver vazio; sem o filtro, ela voltaria, e a agenda de Cobranças listaria contas a pagar.
    const rows = [paid('2026-03', -100, 'pj-com-credor')]
    assert.deepEqual(settlePlanned(rows, ['2026-03'], '2026-03-31', 'income'), [])
    // A janela vai do `startMonth` da regra até o último mês pedido, então uma regra MENSAL desde
    // janeiro devolve três ocorrências para `['2026-03']` — o que se afirma é de QUAL regra elas
    // são, não quantas.
    const asDespesas = settlePlanned(rows, ['2026-03'], '2026-03-31', 'expense')
    assert.deepEqual([...new Set(asDespesas.map((o) => o.ruleId))], ['pj-com-credor'], 'e a despesa continua conciliando')
    assert.equal(asDespesas.find((o) => o.month === '2026-03')?.status, 'settled', 'e o mês do pagamento está quitado')
  })

  it('sem `kind`, todas as regras conciliáveis entram', () => {
    // O caminho que a Previsão usa: ela quer o que foi cumprido dos dois lados e escolhe depois.
    const todas = settlePlanned([paid('2026-03', -100, 'pj-com-credor')], ['2026-03'], '2026-03-31')
    assert.ok(todas.some((o) => o.ruleId === 'pj-com-credor'))
  })

  it('o valor é tomado em MÓDULO — o extrato traz despesa negativa', () => {
    // "A conciliação não conhece sinal, e quem chama já escolheu o lado por `kind`." A regra
    // declara 100 positivo; o extrato traz -100. Sem o `Math.abs`, a ocorrência ficaria em ABERTO
    // com o pagamento na mesma tela, logo abaixo.
    const [ocorrencia] = settlePlanned([paid('2026-03', -100, 'pj-com-credor')], ['2026-03'], '2026-03-31', 'expense')
    assert.equal(ocorrencia.actual, 100)
    assert.equal(ocorrencia.status, 'settled')
  })

  it('sem meses, a janela sai de `today` — e não de uma lista vazia', () => {
    // A chamada degenerada: `months[months.length - 1]` sobre lista vazia é `undefined`, e uma
    // janela que termina em `undefined` não produz ocorrência nenhuma.
    const ocorrencias = settlePlanned([paid('2026-03', -100, 'pj-com-credor')], [], '2026-03-31', 'expense')
    assert.ok(ocorrencias.length > 0, 'a janela existe mesmo sem lista de meses')
    assert.ok((ocorrencias.at(0)?.month ?? '') <= '2026-03', 'e não passa do mês do corte')
  })
})

describe('lastOccurrence: a parcelada sem contagem', () => {
  it('conta como UMA parcela, em vez de uma janela infinita', () => {
    // `Math.max(1, entry.count ?? 1)`. Uma parcelada sem `count` é dado torto — o schema o exige —,
    // mas se chegar, o fim tem de ser o próprio mês de início. Sem o `?? 1`, `undefined - 1` é
    // `NaN`, e `shiftMonth` com `NaN` devolve uma data impossível que a Previsão tentaria desenhar.
    assert.equal(lastOccurrence(rule({ recurrence: 'installments', startMonth: '2026-04', count: undefined })), '2026-04')
    // E `count: 0` também: zero parcelas não é janela vazia, é uma.
    assert.equal(lastOccurrence(rule({ recurrence: 'installments', startMonth: '2026-04', count: 0 })), '2026-04')
  })
})
