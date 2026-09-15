import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { Plan, Transaction } from '@wlet/domain'
import { addMonths, monthsApart } from '@wlet/domain/months'
import { planTotal } from '@wlet/domain/plans'
import { groupInstallmentPurchases, latestInvoiceByAccount, planPurchase, planValue, planValueOf, purchaseContaining, purchaseKeyOf, suggestPurchases } from '@wlet/domain/purchases'

/**
 * As compras parceladas, reconstruídas a partir das parcelas — a base do vínculo entre plano e compra.
 *
 * As fixtures copiam a forma REAL da semente: a hospedagem de julho/26 (6× de ~R$ 937, duas faturas
 * importadas) e a de maio/26, estornada, com a MESMA descrição crua e outra data de compra. É essa
 * vizinhança que decide a chave: descrição sozinha juntaria as duas.
 */
const parcel = (over: Partial<Transaction> & { id: string; date: string; postedDate: string; amount: number; current: number; invoiceMonth: string }): Transaction => {
  const { current, invoiceMonth, ...rest } = over
  return {
    accountId: 'xp-cartao',
    rawDescription: 'AIRBNB PAGAM*AIRB',
    merchant: 'Airbnb',
    categoryId: 'moradia',
    installment: { current, total: 6 },
    invoice: { dueDate: `${invoiceMonth}-10`, month: invoiceMonth },
    ...rest,
  } as Transaction
}

const julyFirst = parcel({ id: 'db78e48a1935', date: '2026-07-04', postedDate: '2026-07-04', amount: -937.05, current: 1, invoiceMonth: '2026-08' })
const julySecond = parcel({ id: '3e8b4c5881bc', date: '2026-08-04', postedDate: '2026-07-04', amount: -937.03, current: 2, invoiceMonth: '2026-09' })
const mayFirst = parcel({ id: 'ff592a71692c', date: '2026-05-11', postedDate: '2026-05-11', amount: -1151.45, current: 1, invoiceMonth: '2026-06' })
const maySecond = parcel({ id: '6689133ee341', date: '2026-06-11', postedDate: '2026-05-11', amount: -1151.41, current: 2, invoiceMonth: '2026-07' })
const ALL = [julyFirst, julySecond, mayFirst, maySecond]

const group = (txs: Transaction[] = ALL) => groupInstallmentPurchases(txs, latestInvoiceByAccount(txs))

describe('aritmética de mês', () => {
  it('soma e subtrai atravessando o ano', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02')
    assert.equal(addMonths('2026-01', -1), '2025-12')
  })

  it('distância em meses, com sinal', () => {
    assert.equal(monthsApart('2026-07', '2026-08'), 1)
    assert.equal(monthsApart('2026-08', '2026-07'), -1)
    assert.equal(monthsApart('2025-12', '2026-02'), 2)
  })
})

describe('a chave da compra', () => {
  it('as parcelas da mesma compra têm a mesma chave', () => {
    assert.equal(purchaseKeyOf(julyFirst), purchaseKeyOf(julySecond))
  })

  it('a compra estornada, com a MESMA descrição crua, tem outra chave', () => {
    assert.notEqual(purchaseKeyOf(julyFirst), purchaseKeyOf(mayFirst))
  })

  it('lançamento sem parcela não tem chave', () => {
    assert.equal(purchaseKeyOf({ ...julyFirst, installment: null }), null)
  })
})

describe('o agrupamento em compras', () => {
  it('produz duas compras, uma para cada data de compra', () => {
    assert.equal(group().length, 2)
  })

  it('o progresso da compra de julho: 2 de 6, R$ 1.874,08 pagos, o resto estimado pela última parcela', () => {
    const july = group().find((p) => p.postedDate === '2026-07-04')
    assert.ok(july)
    assert.equal(july.paidCount, 2)
    assert.equal(july.paidAmount, 1874.08)
    assert.equal(july.lastAmount, 937.03)
    assert.equal(july.estimatedTotal, 5622.2)
    assert.deepEqual(july.remainingMonths, ['2026-09', '2026-10', '2026-11', '2026-12'])
    assert.equal(july.originMonth, '2026-07')
    assert.equal(july.ended, false)
    assert.equal(july.completed, false)
  })

  it('a série cuja última parcela não está na fatura mais recente do cartão está ENCERRADA', () => {
    // A mesma regra que a previsão aplica para parar de projetar: a de maio parou de aparecer
    // enquanto as faturas seguiram chegando — estorno.
    const may = group().find((p) => p.postedDate === '2026-05-11')
    assert.ok(may)
    assert.equal(may.ended, true)
  })

  it('entrada positiva com parcela não vira compra', () => {
    assert.equal(group([{ ...julyFirst, amount: 937.05 }]).length, 0)
  })

  it('parcela repetida conta uma vez no número de pagas', () => {
    const purchase = group([julyFirst, { ...julyFirst, id: 'duplicada' }, julySecond])[0]
    assert.equal(purchase.paidCount, 2)
    assert.equal(purchase.paidAmount, 1874.08)
    assert.equal(purchase.estimatedTotal, 5622.2)
  })
})

describe('achar a compra de uma parcela', () => {
  it('qualquer parcela da compra serve de âncora — não precisa ser a 1/N', () => {
    // Compra antiga pode ter as primeiras faturas fora dos arquivos: a âncora é a mais antiga VISÍVEL.
    const third = parcel({ id: 'terceira', date: '2026-09-04', postedDate: '2026-07-04', amount: -937.03, current: 3, invoiceMonth: '2026-10' })
    const purchases = group([julySecond, third])
    assert.equal(purchaseContaining(purchases, 'terceira')?.paidCount, 2)
    assert.equal(purchaseContaining(purchases, julySecond.id)?.key, purchaseContaining(purchases, 'terceira')?.key)
  })

  it('id que não está em compra nenhuma devolve null', () => {
    assert.equal(purchaseContaining(group(), 'nao-existe'), null)
  })
})

describe('o vínculo de um plano', () => {
  const plan = (purchaseId?: string) => ({ id: 'plan-1', label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided', purchaseId }) as Plan

  it('sem purchaseId é "none"', () => {
    assert.equal(planPurchase(plan(), group()).status, 'none')
  })

  it('com a parcela presente é "linked" e traz a compra', () => {
    const result = planPurchase(plan(julyFirst.id), group())
    assert.equal(result.status, 'linked')
    if (result.status === 'linked') assert.equal(result.purchase.postedDate, '2026-07-04')
  })

  it('com a parcela ausente é "broken" — o plano não some, o vínculo aparece quebrado', () => {
    assert.equal(planPurchase(plan('nao-existe'), group()).status, 'broken')
  })
})

describe('a sugestão de compras para um plano', () => {
  const airbnbPlan = {
    id: 'plan-1',
    label: 'Airbnb Arraial',
    categoryId: 'moradia',
    cash: 5622.2,
    financed: { total: 5622.2, installments: 6 },
    payment: 'financed',
    status: 'decided',
    month: '2026-08',
  } as Plan
  const suggest = (plan: Plan = airbnbPlan, plans: Plan[] = [plan]) => suggestPurchases(plan, group(), plans, '2026-09')

  it('a compra que bate nos quatro critérios vem primeiro, sugerida', () => {
    const [first] = suggest()
    assert.equal(first.purchase.postedDate, '2026-07-04')
    assert.equal(first.score, 4)
    assert.equal(first.suggested, true)
  })

  it('a estornada, com total e mês diferentes, não é sugerida', () => {
    const may = suggest().find((s) => s.purchase.postedDate === '2026-05-11')
    assert.ok(may)
    assert.equal(may.score, 2, 'bate só parcelas e categoria')
    assert.equal(may.suggested, false)
  })

  it('cada critério vale um ponto: número de parcelas', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2, installments: 10 } }), 3)
  })

  it('cada critério vale um ponto: total a até 2%', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2 * 1.019, installments: 6 } }), 4, 'dentro de 2%')
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2 * 1.03, installments: 6 } }), 3, 'fora de 2%')
  })

  it('cada critério vale um ponto: categoria', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, categoryId: 'viagens' }), 3)
  })

  it('cada critério vale um ponto: mês da compra a até 1 mês do mês do plano', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, month: '2026-06' }), 4, 'um mês antes conta')
    assert.equal(july({ ...airbnbPlan, month: '2026-10' }), 3, 'três meses depois não conta')
    assert.equal(july({ ...airbnbPlan, month: undefined }), 3, 'plano sem mês não ganha o ponto')
  })

  it('sem sugestão, a ordem é pela data da compra, mais recente primeiro', () => {
    const plain = { id: 'plan-2', label: 'Outra coisa', categoryId: 'compras', cash: 10, status: 'considering' } as Plan
    assert.deepEqual(
      suggest(plain).map((s) => s.purchase.postedDate),
      ['2026-07-04', '2026-05-11'],
    )
  })

  it('compra já ligada a OUTRO plano vem marcada com o nome dele', () => {
    const other = { ...airbnbPlan, id: 'plan-9', label: 'Viagem antiga', purchaseId: julySecond.id } as Plan
    const july = suggest(airbnbPlan, [airbnbPlan, other]).find((s) => s.purchase.postedDate === '2026-07-04')
    assert.equal(july?.linkedTo, 'Viagem antiga')
  })

  it('o próprio vínculo do plano não o marca como ligado a outro', () => {
    const self = { ...airbnbPlan, purchaseId: julyFirst.id } as Plan
    assert.equal(suggest(self, [self]).find((s) => s.purchase.postedDate === '2026-07-04')?.linkedTo, null)
  })

  it('compra encerrada há mais de 12 meses fica de fora; ativa, nunca', () => {
    const old = parcel({ id: 'antiga', date: '2024-01-04', postedDate: '2024-01-04', amount: -100, current: 1, invoiceMonth: '2024-02' })
    const purchases = groupInstallmentPurchases([...ALL, old], latestInvoiceByAccount([...ALL, old]))
    const dates = suggestPurchases(airbnbPlan, purchases, [airbnbPlan], '2026-09').map((s) => s.purchase.postedDate)
    assert.equal(dates.includes('2024-01-04'), false)
    assert.equal(dates.includes('2026-07-04'), true)
  })
})

describe('o valor de um plano', () => {
  const linkedPlan = (purchaseId?: string, cash = 5622.2) => ({ id: 'plan-1', label: 'Airbnb', categoryId: 'moradia', cash, status: 'decided', purchaseId }) as Plan

  // Uma compra de 2 parcelas, as duas presentes e a última na fatura mais recente do cartão:
  // `completed` (nada falta) e `ended` false (ainda aparece), com paidAmount === estimatedTotal.
  const paidOffFirst = parcel({ id: 'quit-1', date: '2026-05-04', postedDate: '2026-05-04', amount: -500, current: 1, invoiceMonth: '2026-06', installment: { current: 1, total: 2 } })
  const paidOffSecond = parcel({ id: 'quit-2', date: '2026-06-04', postedDate: '2026-05-04', amount: -500, current: 2, invoiceMonth: '2026-07', installment: { current: 2, total: 2 } })
  const paidOff = group([paidOffFirst, paidOffSecond])

  it('ligado à compra ATIVA (julho): o estimado, parcelas pagas mais o resto pela última', () => {
    assert.equal(planValue(linkedPlan(julyFirst.id), group()), 5622.2)
  })

  it('ligado à compra ENCERRADA (maio, 2 de 6): só o PAGO — o resto é fantasma, não dinheiro', () => {
    // A mesma razão que zera "Cai em" e o realce do gráfico para uma série que parou de rodar:
    // contar o resto projetaria um 6× inteiro sobre um estorno de 2 parcelas.
    assert.equal(planValue(linkedPlan(mayFirst.id), group()), 2302.86)
  })

  it('ligado à compra QUITADA: o estimado, que aqui é igual ao pago', () => {
    assert.equal(planValue(linkedPlan(paidOffFirst.id, 999), paidOff), 1000)
  })

  it('sem purchaseId, é o planTotal de sempre', () => {
    const plan = linkedPlan(undefined, 3000)
    assert.equal(planValue(plan, group()), planTotal(plan))
  })

  it('purchaseId apontando para nada (vínculo quebrado) também cai no planTotal', () => {
    const plan = linkedPlan('nao-existe', 3000)
    assert.equal(planValue(plan, group()), planTotal(plan))
  })

  it('planValueOf, com o vínculo já resolvido, dá o MESMO número que planValue nos quatro casos', () => {
    // A linha da tabela resolve o vínculo uma vez e lê o valor pela variante; se as duas divergissem,
    // o total do grupo (planValue) e a célula da linha (planValueOf) mostrariam números diferentes.
    const cases: Array<[Plan, ReturnType<typeof group>]> = [
      [linkedPlan(julyFirst.id), group()],
      [linkedPlan(mayFirst.id), group()],
      [linkedPlan(undefined, 3000), group()],
      [linkedPlan('nao-existe', 3000), group()],
    ]
    for (const [plan, purchases] of cases) assert.equal(planValueOf(plan, planPurchase(plan, purchases)), planValue(plan, purchases))
  })
})

describe('a previsão usa ESTE agrupamento, e não um próprio', () => {
  // Duas chaves para a mesma compra divergem no primeiro caso raro — e o vínculo do plano deixaria
  // de achar a compra que a previsão projeta.
  const source = readFileSync(new URL('../../src/lib/forecast.ts', import.meta.url), 'utf8')

  it('forecast.ts importa groupInstallmentPurchases do domínio', () => {
    assert.match(source, /groupInstallmentPurchases[^\n]*from '@wlet\/domain\/purchases'/)
  })

  it('e não tem mais uma função de chave de compra própria', () => {
    assert.doesNotMatch(source, /function purchaseKey\(/)
  })
})
