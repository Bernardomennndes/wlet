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

const { CONCILIATED, lastOccurrence, pendingIn, plannedInScope } = await import('@/lib/planned')
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
