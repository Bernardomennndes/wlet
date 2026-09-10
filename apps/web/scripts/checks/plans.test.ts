import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decidedPlans,
  emptyPlans,
  installmentAmount,
  parsePlans,
  planInstallments,
  planMonths,
  planOccursIn,
  planScheduleByMonth,
  planTotal,
  savingOf,
  scheduledPlans,
  PLANS_VERSION,
} from '../../src/lib/plans.ts'
import type { Plan } from '../../src/data/types.ts'

/**
 * `parsePlans` é a fronteira de confiança do único dado do app que não vem de arquivo: ele
 * chega do `localStorage`, que pode ter sido editado à mão, ou de um JSON que o usuário
 * escolheu. Um campo torto não pode derrubar o catálogo, e um item inválido não pode entrar na
 * previsão — é por isso que este arquivo existe.
 */

const plano = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  label: 'Monitor',
  categoryId: 'compras',
  cash: 3000,
  payment: 'cash',
  status: 'considering',
  month: '2026-11',
  ...over,
})

const envelope = (items: unknown[], groups: unknown[] = []) => ({ version: PLANS_VERSION, groups, items })

describe('parsePlans: o que não é confiável não entra', () => {
  it('devolve vazio para lixo', () => {
    for (const raw of [null, undefined, 42, 'texto', []]) assert.deepEqual(parsePlans(raw), emptyPlans())
  })

  it('descarta versão desconhecida, mas MIGRA a versão 1', () => {
    assert.deepEqual(parsePlans({ version: 99, groups: [], items: [plano()] }), emptyPlans())
    assert.deepEqual(parsePlans({ groups: [], items: [plano()] }), emptyPlans())
    // A versão 1 tinha `amount` + `installments`. Descartá-la apagaria a lista de quem já usava.
    const v1 = { version: 1, groups: [], items: [{ id: 'a', label: 'Cadeira', categoryId: 'compras', amount: 1200, installments: 6, status: 'decided', month: '2026-11' }] }
    assert.equal(parsePlans(v1).items.length, 1)
  })

  it('a migração da versão 1 preserva o valor e a forma de pagamento', () => {
    const item = (extra: object) => ({ id: 'a', label: 'X', categoryId: 'compras', amount: 1200, status: 'considering', month: '2026-11', ...extra })
    const parcelado = parsePlans({ version: 1, groups: [], items: [item({ installments: 6 })] }).items[0]
    assert.equal(parcelado.payment, 'financed')
    assert.deepEqual(parcelado.financed, { total: 1200, installments: 6 })
    // Sem desconto conhecido, o à vista recebe o mesmo valor: é a verdade disponível.
    assert.equal(parcelado.cash, 1200)
    assert.equal(savingOf(parcelado), 0)

    const avista = parsePlans({ version: 1, groups: [], items: [item({})] }).items[0]
    assert.equal(avista.payment, 'cash')
    assert.equal(avista.financed, undefined)
    assert.equal(planTotal(avista), 1200)
  })

  it('exige preço à vista positivo', () => {
    for (const cash of [0, -5, Number.NaN, undefined]) assert.equal(parsePlans(envelope([plano({ cash: cash as number })])).items.length, 0, String(cash))
    assert.equal(parsePlans(envelope([plano({ cash: 1 })])).items.length, 1)
  })

  it('sem preço à vista mas com parcelado, o parcelado vira a referência', () => {
    const raw = { ...plano(), cash: undefined, financed: { total: 900, installments: 3 }, payment: 'financed' }
    const p = parsePlans(envelope([raw])).items[0]
    assert.equal(p.cash, 900)
    assert.equal(p.payment, 'financed')
  })

  it('descarta categoria desconhecida — sem ela o plano não teria onde entrar', () => {
    assert.equal(parsePlans(envelope([plano({ categoryId: 'nao-existe' })])).items.length, 0)
  })

  it('mês ausente ou torto DEGRADA para sem mês, em vez de derrubar o plano', () => {
    // Agora que "sem mês" é um estado representável, uma data inválida vira ele: o plano tem
    // nome, preço e categoria, e perdê-lo inteiro por causa da data seria pior.
    for (const month of ['2026-13', '26-11', '2026-11-03', '', undefined]) {
      const items = parsePlans(envelope([plano({ month })])).items
      assert.equal(items.length, 1, String(month))
      assert.equal(items[0].month, undefined, String(month))
    }
    assert.equal(parsePlans(envelope([plano({ month: '2026-11' })])).items[0].month, '2026-11')
  })

  it('parcelamento fora de 2..99 invalida o bloco parcelado inteiro', () => {
    for (const n of [1, 0, -3, 100, 2.5, '6']) {
      const p = parsePlans(envelope([plano({ financed: { total: 900, installments: n as number }, payment: 'financed' })])).items[0]
      assert.equal(p.financed, undefined, String(n))
      // E a escolha cai para NÃO DECIDIDA: um estado que não se pode desenhar não sobrevive à
      // leitura, e afirmar "à vista" inventaria uma decisão que ninguém tomou.
      assert.equal(p.payment, undefined, String(n))
    }
    assert.deepEqual(parsePlans(envelope([plano({ financed: { total: 900, installments: 6 } })])).items[0].financed, { total: 900, installments: 6 })
  })

  it('escolher parcelado sem preço parcelado cai para não decidido', () => {
    assert.equal(parsePlans(envelope([plano({ payment: 'financed' })])).items[0].payment, undefined)
  })

  it('forma de pagamento ausente continua ausente — não vira à vista', () => {
    const p = parsePlans(envelope([plano({ payment: undefined })])).items[0]
    assert.equal(p.payment, undefined)
    // Mas o cálculo não trava: sem escolha, vale o preço à vista, o único que sempre existe.
    assert.equal(planTotal(p), 3000)
    assert.equal(planInstallments(p), 1)
  })

  it('status desconhecido cai para em estudo, e grupo inexistente solta o item', () => {
    assert.equal(parsePlans(envelope([plano({ status: 'qualquer' as Plan['status'] })])).items[0].status, 'considering')
    const solto = parsePlans(envelope([plano({ groupId: 'viagem' })])).items[0]
    assert.equal(solto.groupId, undefined)
    assert.equal(parsePlans(envelope([plano({ groupId: 'viagem' })], [{ id: 'viagem', label: 'Chile' }])).items[0].groupId, 'viagem')
  })
})

describe('as duas formas de pagamento', () => {
  const dois = plano({ cash: 3000, financed: { total: 3400, installments: 10 } })

  it('o total é o da forma escolhida', () => {
    assert.equal(planTotal({ ...dois, payment: 'cash' }), 3000)
    assert.equal(planTotal({ ...dois, payment: 'financed' }), 3400)
  })

  it('a economia é a diferença entre as duas, e é null sem comparação', () => {
    assert.equal(savingOf(dois), 400)
    assert.equal(savingOf(plano()), null)
    // Parcelado mais barato existe e sai negativo, em vez de virar zero.
    assert.equal(savingOf(plano({ cash: 1000, financed: { total: 900, installments: 3 } })), -100)
  })

  it('à vista ocupa um mês; parcelado espalha e atravessa a virada de ano', () => {
    assert.deepEqual(planMonths({ ...dois, payment: 'cash', month: '2026-11' }), ['2026-11'])
    assert.deepEqual(planMonths({ ...dois, payment: 'financed', month: '2026-11', financed: { total: 3400, installments: 4 } }), ['2026-11', '2026-12', '2027-01', '2027-02'])
  })

  it('a parcela é o total da forma escolhida dividido pelas vezes', () => {
    assert.equal(installmentAmount({ ...dois, payment: 'cash' }), 3000)
    assert.equal(installmentAmount({ ...dois, payment: 'financed' }), 340)
    assert.equal(planInstallments({ ...dois, payment: 'cash' }), 1)
  })

  it('parcelado sem preço parcelado cai no à vista em vez de virar zero', () => {
    const torto = { ...plano({ cash: 500 }), payment: 'financed' as const }
    assert.equal(planTotal(torto), 500)
    assert.equal(planInstallments(torto), 1)
    assert.deepEqual(planMonths(torto), ['2026-11'])
  })

  it('a soma das parcelas devolve o total', () => {
    const p = { ...dois, payment: 'financed' as const, financed: { total: 5000, installments: 7 } }
    const soma = planMonths(p).reduce((s) => s + installmentAmount(p), 0)
    assert.ok(Math.abs(soma - 5000) < 1e-9)
  })

  it('ocorre só nos meses que ocupa', () => {
    const p = { ...dois, payment: 'financed' as const, month: '2026-11', financed: { total: 900, installments: 3 } }
    assert.equal(planOccursIn(p, '2026-10'), false)
    assert.equal(planOccursIn(p, '2027-01'), true)
    assert.equal(planOccursIn(p, '2027-02'), false)
  })
})

describe('um plano sem mês é desejo, não compromisso', () => {
  const semData = plano({ month: undefined, financed: { total: 900, installments: 3 }, payment: 'financed' })

  it('não ocupa mês nenhum, e é isso que o mantém fora da previsão', () => {
    // `forecast.ts` não tem guarda para isso: ele pergunta `planOccursIn`, que sobre uma lista
    // vazia responde não para TODO mês. O corte acontece aqui.
    assert.deepEqual(planMonths(semData), [])
    for (const mes of ['2026-10', '2026-11', '2027-01']) assert.equal(planOccursIn(semData, mes), false, mes)
  })

  it('continua somando: ele está na lista e nos totais, só não na linha do tempo', () => {
    assert.equal(planTotal(semData), 900)
    assert.equal(installmentAmount(semData), 300)
  })

  it('scheduledPlans separa quem tem data de quem não tem', () => {
    const lista = [plano({ id: 'a', month: '2026-11' }), semData, plano({ id: 'c', month: undefined })]
    assert.deepEqual(
      scheduledPlans(lista).map((p) => p.id),
      ['a'],
    )
  })
})

describe('a agenda que o gráfico desenha', () => {
  const agenda = () =>
    planScheduleByMonth([
      plano({ id: 'a', cash: 3000, month: '2026-10', status: 'decided' }),
      plano({ id: 'b', cash: 2700, financed: { total: 2700, installments: 3 }, payment: 'financed', month: '2026-11', status: 'decided' }),
      plano({ id: 'c', cash: 1200, month: '2027-01', status: 'considering' }),
      plano({ id: 'd', cash: 9999, month: '2026-12', status: 'discarded' }),
      plano({ id: 'e', cash: 5000, month: undefined, status: 'decided' }),
    ])

  it('o eixo é de CALENDÁRIO: mês sem plano aparece zerado, não some', () => {
    // Sem o preenchimento, a série pularia meses e a folga entre uma compra e a seguinte —
    // que é o que se quer enxergar — desapareceria do desenho.
    const meses = agenda().map((m) => m.month)
    assert.deepEqual(meses, ['2026-10', '2026-11', '2026-12', '2027-01'])
  })

  it('separa decidido de em estudo, e a parcelada se espalha', () => {
    assert.deepEqual(agenda(), [
      { month: '2026-10', decided: 3000, considering: 0 },
      { month: '2026-11', decided: 900, considering: 0 },
      { month: '2026-12', decided: 900, considering: 0 },
      { month: '2027-01', decided: 900, considering: 1200 },
    ])
  })

  it('descartado e sem mês ficam de fora', () => {
    // O descartado custaria 9.999 em 2026-12, onde a agenda mostra só os 900 da parcelada.
    const dezembro = agenda().find((m) => m.month === '2026-12')
    assert.equal(dezembro?.decided, 900)
    // E o total da agenda NÃO é o total da lista: a diferença é o que ainda não tem data.
    const total = agenda().reduce((sum, m) => sum + m.decided + m.considering, 0)
    assert.equal(total, 3000 + 2700 + 1200)
  })

  it('lista sem nada agendável devolve vazio, não um mês solitário', () => {
    assert.deepEqual(planScheduleByMonth([]), [])
    assert.deepEqual(planScheduleByMonth([plano({ month: undefined })]), [])
    assert.deepEqual(planScheduleByMonth([plano({ status: 'discarded' })]), [])
  })

  it('atravessa a virada de ano sem pular dezembro', () => {
    const meses = planScheduleByMonth([plano({ cash: 400, financed: { total: 400, installments: 4 }, payment: 'financed', month: '2026-11' })]).map((m) => m.month)
    assert.deepEqual(meses, ['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('o que a previsão real considera', () => {
  it('só o decidido — em estudo e descartado ficam de fora', () => {
    const lista = [plano({ id: 'a', status: 'decided' }), plano({ id: 'b', status: 'considering' }), plano({ id: 'c', status: 'discarded' })]
    assert.deepEqual(
      decidedPlans(lista).map((p) => p.id),
      ['a'],
    )
  })
})
