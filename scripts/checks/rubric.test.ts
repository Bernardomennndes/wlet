import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BudgetCategory } from '../../src/data/types.ts'
import { hasComposition, itemAmount, rubricAmount, rubricSpent } from '../../src/lib/rubric.ts'

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

describe('gasto de uma rubrica no mês', () => {
  const tx = (month: string, displayCategoryId: string, flow: 'expense' | 'income' | 'transfer' | 'reimbursement', amount: number) => ({ month, displayCategoryId, flow, amount })

  it('soma as saídas da categoria no mês, e só elas', () => {
    const history = [tx('2026-09', 'mercado', 'expense', -100), tx('2026-09', 'mercado', 'expense', -50), tx('2026-08', 'mercado', 'expense', -900), tx('2026-09', 'lazer', 'expense', -70)]
    assert.equal(rubricSpent(history, '2026-09', 'mercado'), 150)
  })

  it('o reembolso ABATE, porque é despesa negativa', () => {
    // A mesma regra do resto do app: pagar inteiro e receber metade deixa a categoria pelo
    // custo real. Se a rubrica contasse o bruto, ela acusaria estouro que não houve.
    const history = [tx('2026-09', 'moradia', 'expense', -1500), tx('2026-09', 'moradia', 'reimbursement', 750)]
    assert.equal(rubricSpent(history, '2026-09', 'moradia'), 750)
  })

  it('entrada e transferência não entram', () => {
    const history = [tx('2026-09', 'mercado', 'income', 300), tx('2026-09', 'mercado', 'transfer', -200)]
    assert.equal(rubricSpent(history, '2026-09', 'mercado'), 0)
  })

  it('trava em zero: reembolso sem a despesa do mês não vira gasto negativo', () => {
    // O rateio de agosto que chega em setembro. Negativo, nem barra nem pilha desenham.
    const history = [tx('2026-09', 'moradia', 'reimbursement', 750)]
    assert.equal(rubricSpent(history, '2026-09', 'moradia'), 0)
  })
})
