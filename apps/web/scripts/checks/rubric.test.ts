import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BudgetCategory } from '@wlet/domain'
import { hasComposition, itemAmount, itemAmountPerCadence, monthRange, rubricAmount, rubricSpent, weekRange } from '@wlet/domain/rubric'

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

describe('janelas de medição', () => {
  it('o mês vai do dia 1 ao último, que o calendário informa', () => {
    assert.deepEqual(monthRange('2026-09'), { from: '2026-09-01', to: '2026-09-30' })
    assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' })
    assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' }, 'ano bissexto')
  })

  it('a semana vai de SEGUNDA a domingo', () => {
    // 2026-09-10 é uma quinta.
    assert.deepEqual(weekRange('2026-09-10'), { from: '2026-09-07', to: '2026-09-13' })
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    // A armadilha do `getDay()`: domingo é 0, e sem o ajuste ele puxaria a semana seguinte.
    assert.deepEqual(weekRange('2026-09-13'), { from: '2026-09-07', to: '2026-09-13' })
  })

  it('a semana ATRAVESSA a virada do mês, e é por isso que a janela é de datas', () => {
    assert.deepEqual(weekRange('2026-10-01'), { from: '2026-09-28', to: '2026-10-04' })
  })
})

describe('custo mensal de um item', () => {
  const item = (quantity: number, unitAmount: number, cadence?: 'day' | 'week' | 'month') => ({ label: 'x', quantity, unitAmount, cadence })

  it('sem cadência vale MENSAL, e o valor de quem já tinha composição não muda', () => {
    assert.equal(itemAmount({ label: 'Whey', quantity: 2, unitAmount: 180 }), 360)
  })

  it('semanal converte pela média do ano civil', () => {
    // 2 kg × R$ 22 × (365 ÷ 7 ÷ 12) — o mês médio, não as semanas reais do mês.
    assert.equal(Math.round(itemAmount(item(2, 22, 'week')) * 100) / 100, 191.19)
  })

  it('as três cadências descrevem o MESMO ano', () => {
    // A âncora única: com a semana vinda de "52 por ano" e o dia de "365 por ano", um item
    // diário e um semanal equivalentes fechariam o ano com valores diferentes.
    const porDia = itemAmount(item(7, 10, 'day')) * 12
    const porSemana = itemAmount(item(49, 10, 'week')) * 12
    assert.equal(Math.round(porDia), Math.round(porSemana))
  })

  it('a cadência NÃO entra no valor por cadência — ele é o que a pessoa digitou', () => {
    assert.equal(itemAmountPerCadence(item(2, 22, 'week')), 44)
  })
})

describe('gasto de uma rubrica numa janela', () => {
  const tx = (date: string, displayCategoryId: string, flow: 'expense' | 'income' | 'transfer' | 'reimbursement', amount: number) => ({ date, displayCategoryId, flow, amount })
  const setembro = monthRange('2026-09')

  it('soma as saídas da categoria na janela, e só elas', () => {
    const history = [tx('2026-09-03', 'mercado', 'expense', -100), tx('2026-09-20', 'mercado', 'expense', -50), tx('2026-08-30', 'mercado', 'expense', -900), tx('2026-09-05', 'lazer', 'expense', -70)]
    assert.equal(rubricSpent(history, setembro, 'mercado'), 150)
  })

  it('as duas pontas da janela são INCLUSIVAS', () => {
    const history = [tx('2026-09-01', 'mercado', 'expense', -10), tx('2026-09-30', 'mercado', 'expense', -20)]
    assert.equal(rubricSpent(history, setembro, 'mercado'), 30)
  })

  it('a semana recorta dentro do mês', () => {
    const history = [tx('2026-09-07', 'mercado', 'expense', -40), tx('2026-09-20', 'mercado', 'expense', -60)]
    assert.equal(rubricSpent(history, weekRange('2026-09-10'), 'mercado'), 40)
  })

  it('o reembolso ABATE, porque é despesa negativa', () => {
    // A mesma regra do resto do app: pagar inteiro e receber metade deixa a categoria pelo
    // custo real. Se a rubrica contasse o bruto, ela acusaria estouro que não houve.
    const history = [tx('2026-09-05', 'moradia', 'expense', -1500), tx('2026-09-12', 'moradia', 'reimbursement', 750)]
    assert.equal(rubricSpent(history, setembro, 'moradia'), 750)
  })

  it('entrada e transferência não entram', () => {
    const history = [tx('2026-09-05', 'mercado', 'income', 300), tx('2026-09-06', 'mercado', 'transfer', -200)]
    assert.equal(rubricSpent(history, setembro, 'mercado'), 0)
  })

  it('trava em zero: reembolso sem a despesa da janela não vira gasto negativo', () => {
    // O rateio de agosto que chega em setembro. Negativo, nem barra nem pilha desenham.
    const history = [tx('2026-09-12', 'moradia', 'reimbursement', 750)]
    assert.equal(rubricSpent(history, setembro, 'moradia'), 0)
  })
})
