import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setDataset, setDeclarations } from '@/lib/dataset'

/**
 * Os dois MEDIDORES do app: o teto do mês e o progresso de uma meta.
 *
 * São vinte linhas somadas, e é por isso que estavam sem teste — mas as duas decidem uma COR e
 * uma LARGURA, que é o tipo de saída que ninguém confere com calculadora. Um erro aqui não
 * estoura: o mês fica amarelo cedo demais, ou a barra da meta passa da caixa, e quem olha supõe
 * que o número é esse mesmo.
 *
 * O portão de boot é semeado antes do import porque `budget.ts` e `goals.ts` leem `declarations()`
 * na avaliação — as duas expõem a constante do conjunto ao lado da função pura.
 */
setDataset({ transactions: [], accounts: [], transfers: [], meta: { months: [] }, investments: { snapshot: null, series: [], income: [] } } as never)
setDeclarations({
  planned: [],
  budget: { monthlyLimit: 1000, warnAt: 0.75, byCategory: [] },
  receivables: [],
  goals: [{ id: 'g1', label: 'Reserva', saved: 5000, target: 20000, targetMonth: '2027-12', slot: 3 }],
  accounts: [],
  rules: [],
  selfNamePatterns: [],
} as never)

const { budgetState, BUDGET_STATE } = await import('@/lib/budget')
const { goalProgress, GOALS } = await import('@/lib/goals')

const goal = (saved: number, target: number) => ({ id: 'x', label: 'x', saved, target, targetMonth: '2027-12', slot: 1 }) as never

describe('o teto do mês', () => {
  const teto = { monthlyLimit: 1000, warnAt: 0.75, byCategory: [] }

  it('avisa a partir da fração declarada, e não antes', () => {
    // O aviso é o recurso escasso da tela: se ele acende cedo, a pessoa aprende a ignorá-lo, e
    // aí ele não serve para o mês em que deveria servir.
    assert.equal(budgetState(749, teto), 'ok')
    assert.equal(budgetState(750, teto), 'warning', 'a borda é INCLUSIVA: 75% já é perto do limite')
    assert.equal(budgetState(999.99, teto), 'warning')
  })

  it('e só passa a "ultrapassado" ao ALCANÇAR o limite', () => {
    assert.equal(budgetState(1000, teto), 'over', 'gastar exatamente o teto é ter ultrapassado o que sobrava')
    assert.equal(budgetState(1500, teto), 'over')
  })

  it('teto não configurado não acusa nada', () => {
    // Zero aqui é "nunca configurou", não "limite zero". Tratá-lo como limite pintaria de
    // vermelho todo mês de quem nunca abriu a tela de orçamento — inclusive o primeiro.
    for (const limite of [0, -1, Number.NaN]) {
      assert.equal(budgetState(5000, { ...teto, monthlyLimit: limite }), 'ok', `limite ${limite}`)
    }
  })

  it('mês sem gasto nenhum está dentro do limite', () => {
    assert.equal(budgetState(0, teto), 'ok')
  })

  it('o teto vem das DECLARAÇÕES quando ninguém passa um', () => {
    // A função aceita um orçamento por parâmetro e cai no do conjunto — é o que permite testá-la
    // sem o portão, e é o que a tela usa sem passar nada.
    assert.equal(budgetState(800), 'warning')
  })
})

describe('como cada situação do teto se apresenta', () => {
  it('as três têm mensagem e cor de barra', () => {
    // A lista é ÚNICA por decisão registrada: enquanto as três faces de um `BudgetState` viviam
    // espalhadas, duas telas decidiam a aparência do mesmo estado em arquivos diferentes — e foi
    // assim que a lista de Rubricas ficou apontando para um token que NUNCA existiu, deixando a
    // porcentagem de uma rubrica perto do limite SEM COR.
    for (const state of ['ok', 'warning', 'over'] as const) {
      assert.ok(BUDGET_STATE[state].message.length > 0, state)
      assert.match(BUDGET_STATE[state].bar, /^var\(--/, `${state}: a cor da barra tem de ser um token`)
      assert.ok(BUDGET_STATE[state].Icon, `${state}: sem ícone`)
    }
  })

  it('e o estado BOM é deliberadamente sem cor de texto', () => {
    // Pintar o normal gasta o realce que os outros dois precisam. A ausência é a decisão.
    assert.equal(BUDGET_STATE.ok.text, '')
    assert.notEqual(BUDGET_STATE.warning.text, '')
    assert.notEqual(BUDGET_STATE.over.text, '')
  })

  it('nenhum estado pinta FUNDO', () => {
    // A mesma regra dos badges de status: a cor semântica vive no texto e na borda.
    for (const state of ['ok', 'warning', 'over'] as const) {
      assert.doesNotMatch(BUDGET_STATE[state].text, /(^|\s)bg-/, state)
      assert.doesNotMatch(BUDGET_STATE[state].banner, /(^|\s)bg-/, state)
    }
  })
})

describe('o progresso de uma meta', () => {
  it('é a fração guardada', () => {
    assert.equal(goalProgress(goal(5000, 20000)), 0.25)
  })

  it('TRAVA em 1: passar da meta não estoura a barra', () => {
    // Sem a trava a barra passa da caixa — e o excesso, que é notícia boa, vira defeito visual.
    assert.equal(goalProgress(goal(25000, 20000)), 1)
  })

  it('meta sem alvo é zero, e não divisão por zero', () => {
    // `0 / 0` é NaN e `x / 0` é Infinity; os dois chegam à tela como barra sem largura ou barra
    // infinita. Zero é a única leitura honesta de uma meta que ninguém dimensionou.
    for (const target of [0, -100, Number.NaN]) {
      assert.equal(goalProgress(goal(1000, target)), 0, `alvo ${target}`)
    }
  })

  it('e as metas declaradas chegam do conjunto', () => {
    assert.equal(GOALS.length, 1)
    assert.equal(goalProgress(GOALS[0]), 0.25)
  })
})
