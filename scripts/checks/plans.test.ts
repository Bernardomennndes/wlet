import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decidedPlans, emptyPlans, installmentAmount, parsePlans, planMonths, planOccursIn, PLANS_VERSION } from '../../src/lib/plans.ts'
import type { Plan } from '../../src/data/types.ts'

/**
 * `parsePlans` é a fronteira de confiança do único dado do app que não vem de arquivo: ele
 * chega do `localStorage`, que pode ter sido editado à mão, ou de um JSON que o usuário
 * escolheu. Um campo torto não pode derrubar o catálogo, e um item inválido não pode entrar na
 * previsão — é por isso que este arquivo existe.
 */

const plano = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  label: 'Notebook',
  categoryId: 'compras',
  amount: 6000,
  status: 'considering',
  month: '2026-11',
  ...over,
})

const envelope = (items: unknown[], groups: unknown[] = []) => ({ version: PLANS_VERSION, groups, items })

describe('parsePlans: o que não é confiável não entra', () => {
  it('devolve vazio para lixo', () => {
    for (const raw of [null, undefined, 42, 'texto', []]) assert.deepEqual(parsePlans(raw), emptyPlans())
  })

  it('devolve vazio quando a versão não é a esperada', () => {
    // O envelope antigo é descartado inteiro em vez de lido pela metade: é para isso que a
    // versão existe.
    assert.deepEqual(parsePlans({ version: 99, groups: [], items: [plano()] }), emptyPlans())
    assert.deepEqual(parsePlans({ groups: [], items: [plano()] }), emptyPlans())
  })

  it('mantém o item válido e descarta só o inválido', () => {
    const { items } = parsePlans(envelope([plano(), plano({ id: 'p2', amount: 0 }), plano({ id: 'p3', label: '  ' }), plano({ id: 'p4' })]))
    assert.deepEqual(
      items.map((p) => p.id),
      ['p1', 'p4'],
    )
  })

  it('descarta categoria desconhecida', () => {
    // Sem categoria válida o plano entraria num total sem aparecer em categoria nenhuma.
    assert.equal(parsePlans(envelope([plano({ categoryId: 'nao-existe' })])).items.length, 0)
    assert.equal(parsePlans(envelope([plano({ categoryId: 'compras' })])).items.length, 1)
  })

  it('exige mês no formato AAAA-MM', () => {
    for (const month of ['2026-13', '2026-00', '26-11', '2026-11-03', '']) assert.equal(parsePlans(envelope([plano({ month })])).items.length, 0, month)
    assert.equal(parsePlans(envelope([plano({ month: '2026-01' })])).items.length, 1)
  })

  it('parcelamento fora de 1..99 vira à vista', () => {
    const casos: [unknown, number | undefined][] = [
      [6, 6],
      [1, undefined],
      [0, undefined],
      [-3, undefined],
      [100, undefined],
      [2.5, undefined],
      ['6', undefined],
    ]
    for (const [entrada, esperado] of casos) {
      const { items } = parsePlans(envelope([plano({ installments: entrada as number })]))
      assert.equal(items[0].installments, esperado, String(entrada))
    }
  })

  it('status desconhecido cai para em estudo', () => {
    assert.equal(parsePlans(envelope([plano({ status: 'qualquer' as Plan['status'] })])).items[0].status, 'considering')
    assert.equal(parsePlans(envelope([plano({ status: 'decided' })])).items[0].status, 'decided')
  })

  it('grupo inexistente solta o item em vez de sumir com ele', () => {
    const semGrupo = parsePlans(envelope([plano({ groupId: 'viagem' })]))
    assert.equal(semGrupo.items.length, 1)
    assert.equal(semGrupo.items[0].groupId, undefined)

    const comGrupo = parsePlans(envelope([plano({ groupId: 'viagem' })], [{ id: 'viagem', label: 'Chile' }]))
    assert.equal(comGrupo.items[0].groupId, 'viagem')
  })

  it('grupo sem rótulo é descartado', () => {
    assert.equal(parsePlans(envelope([], [{ id: 'g1' }, { id: 'g2', label: 'Chile' }])).groups.length, 1)
  })
})

describe('parcelamento: onde o plano cai', () => {
  it('à vista ocupa só o mês da compra', () => {
    assert.deepEqual(planMonths(plano({ month: '2026-11' })), ['2026-11'])
  })

  it('parcelado espalha e atravessa a virada de ano', () => {
    assert.deepEqual(planMonths(plano({ month: '2026-11', installments: 4 })), ['2026-11', '2026-12', '2027-01', '2027-02'])
  })

  it('o valor do mês é o total dividido pelas parcelas', () => {
    assert.equal(installmentAmount(plano({ amount: 6000 })), 6000)
    assert.equal(installmentAmount(plano({ amount: 6000, installments: 6 })), 1000)
  })

  it('a soma das parcelas devolve o total', () => {
    const p = plano({ amount: 5000, installments: 7 })
    const soma = planMonths(p).reduce((s) => s + installmentAmount(p), 0)
    assert.ok(Math.abs(soma - p.amount) < 1e-9)
  })

  it('ocorre só nos meses que ocupa', () => {
    const p = plano({ month: '2026-11', installments: 3 })
    assert.equal(planOccursIn(p, '2026-10'), false)
    assert.equal(planOccursIn(p, '2026-11'), true)
    assert.equal(planOccursIn(p, '2027-01'), true)
    assert.equal(planOccursIn(p, '2027-02'), false)
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
