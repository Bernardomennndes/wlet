import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BudgetCategory } from '../../src/data/types.ts'
import { hasComposition, itemAmount, rubricAmount } from '../../src/lib/rubric.ts'

describe('valor de uma rubrica', () => {
  it('sem composição, vale o número digitado', () => {
    assert.equal(rubricAmount({ categoryId: 'mercado', amount: 900 }), 900)
  })

  it('com composição, vale a SOMA dos itens — o total gravado é ignorado', () => {
    // É o ponto do desenho: guardar um total ao lado da lista que o gera criaria duas somas
    // para a mesma grandeza, e elas divergem no primeiro item editado. Aqui só uma é lida.
    const rubrica: BudgetCategory = {
      categoryId: 'suplementacao',
      amount: 1,
      items: [
        { label: 'Whey 900g', quantity: 2, unitAmount: 180 },
        { label: 'Creatina 300g', quantity: 1, unitAmount: 120 },
      ],
    }
    assert.equal(rubricAmount(rubrica), 480)
  })

  it('quantidade fracionária é dado, não erro de digitação', () => {
    // Meio quilo por mês é consumo legítimo; arredondar para 1 mentiria sobre a dieta.
    assert.equal(itemAmount({ label: 'Castanha', quantity: 0.5, unitAmount: 70 }), 35)
  })

  it('lista VAZIA cai no valor digitado, em vez de zerar a rubrica', () => {
    // `items: []` chega de um JSON editado à mão ou de um pacote antigo. Somá-la daria zero, e
    // a rubrica sumiria da previsão sem nada explicar.
    assert.equal(rubricAmount({ categoryId: 'mercado', amount: 900, items: [] }), 900)
    assert.equal(hasComposition({ categoryId: 'mercado', amount: 900, items: [] }), false)
  })
})
