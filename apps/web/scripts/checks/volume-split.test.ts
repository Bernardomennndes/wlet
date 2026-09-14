import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Transaction } from '@wlet/domain'
import { setDataset, setDeclarations } from '@/lib/dataset'

/**
 * A BARRA DE VOLUME — as maiores categorias mais o resto, e por que o resto não é opcional.
 *
 * Sem "Outras saídas" a soma das fatias não fecha o total e a barra ENCOLHE, mentindo sobre a
 * proporção do que ela representa. É um erro que não estoura e que ninguém confere: a barra
 * continua desenhada, com as mesmas cores, só mais curta do que o número ao lado dela diz.
 *
 * Junto vem a decisão de cor: o slot de cada categoria é decidido UMA VEZ, sobre o conjunto
 * inteiro e fora de qualquer filtro, somando os TRÊS recortes. É isso que faz trocar de recorte
 * nunca repintar uma série — e é o que dá slot próprio a "Retirada para o sócio", que só existe
 * dentro de uma visão e cairia no cinza de "Outras" se o ranking olhasse só o consolidado.
 */
const account = (id: string, entity: 'PF' | 'PJ') =>
  ({ id, name: id, bank: 'Banco', bankCode: '000', type: 'checking', entity, holder: 'T', externalId: id, coverage: null, reportedBalance: null, sources: [], transactionCount: 0 }) as never

const tx = (over: Partial<Transaction> & { amount: number; categoryId: string }): Transaction =>
  ({
    id: `${over.categoryId}-${over.amount}`,
    accountId: 'pf',
    date: '2026-08-10',
    postedDate: '2026-08-10',
    merchant: 'LOJA',
    description: 'LOJA',
    rawDescription: 'LOJA',
    kind: 'statement',
    categoryRule: null,
    installment: null,
    invoice: null,
    transferId: null,
    transferKind: null,
    counterpartAccountId: null,
    receivableId: null,
    plannedId: null,
    source: 'teste.ofx',
    fitId: null,
    ...over,
  }) as Transaction

/**
 * O ranking que decide os slots, semeado de propósito.
 *
 * A retirada é uma SAÍDA da PJ para a PF: no consolidado ela é transferência e não entra em
 * ranking nenhum; na visão PJ ela é despesa e vira "Retirada para o sócio". É o único jeito de
 * uma categoria existir só dentro de um recorte, e é o caso que o módulo cita.
 */
const SEED: Transaction[] = [
  // A MAIOR saída do conjunto, e ela não pode receber slot: "Outros" tem o cinza reservado, e um
  // slot para ela roubaria a cor de uma categoria de verdade. A mutação mostrou que sem esta linha
  // o teste de baixo passava pelo motivo errado — sem lançamento em `outros`, tirar a exclusão do
  // módulo não mudava nada.
  tx({ categoryId: 'outros', amount: -2000 }),
  tx({ categoryId: 'moradia', amount: -900 }),
  tx({ categoryId: 'mercado', amount: -800 }),
  tx({ categoryId: 'transporte', amount: -700 }),
  tx({ categoryId: 'saude', amount: -600 }),
  tx({ categoryId: 'restaurantes', amount: -550 }),
  tx({ categoryId: 'assinaturas', amount: -500 }),
  tx({ categoryId: 'compras', amount: -450 }),
  tx({ categoryId: 'lazer', amount: -400 }),
  tx({ categoryId: 'viagens', amount: -350 }),
  tx({ id: 'retirada', accountId: 'pj', categoryId: 'transferencia', amount: -1300, transferKind: 'internal', counterpartAccountId: 'pf' }),
]

setDataset({ transactions: SEED, accounts: [account('pf', 'PF'), account('pj', 'PJ')], transfers: [], meta: { months: ['2026-08'] }, investments: { snapshot: null, series: [], income: [] } } as never)
setDeclarations({ planned: [], budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, receivables: [], goals: [], accounts: [], rules: [], selfNamePatterns: [] } as never)

const { MAX_SEGMENTS, splitExpense, splitVolume } = await import('@/lib/expense-segments')
const { categoryColor, INCOME_VAR, OTHER_VAR, SERIES_VARS } = await import('@/lib/chart-tokens')

const segment = (categoryId: string, value: number) => ({ categoryId, label: categoryId, value })
const sum = (parts: { value: number }[]) => Math.round(parts.reduce((total, part) => total + part.value, 0) * 100) / 100

describe('o resto NÃO é opcional', () => {
  it('as fatias somam o total, com "Outras saídas" fechando a conta', () => {
    const parts = splitExpense([segment('moradia', 500), segment('mercado', 300), segment('transporte', 200), segment('lazer', 100), segment('saude', 50)], 1150)
    assert.equal(parts.length, MAX_SEGMENTS + 1)
    assert.equal(parts.at(-1)?.label, 'Outras saídas')
    assert.equal(parts.at(-1)?.value, 150, 'o que as três maiores não nomearam')
    assert.equal(sum(parts), 1150, 'a barra desenha o total, não a parte que coube na legenda')
  })

  it('quando as nomeadas já cobrem tudo, não há fatia de resto', () => {
    const parts = splitExpense([segment('moradia', 500), segment('mercado', 300)], 800)
    assert.deepEqual(
      parts.map((part) => part.key),
      ['moradia', 'mercado'],
    )
  })

  it('e um resíduo de meio centavo não vira fatia', () => {
    // Uma fatia de R$ 0,001 é invisível na barra e VISÍVEL na legenda: "Outras saídas — R$ 0,00"
    // ao lado de três categorias, que lê como categoria esquecida em vez de arredondamento.
    assert.equal(splitExpense([segment('moradia', 500)], 500.001).length, 1)
  })

  it('categoria ZERADA não gasta uma das três vagas', () => {
    // Ela não tem o que desenhar, e ocupar vaga empurraria uma categoria real para dentro de
    // "Outras" — a barra ficaria certa e a LEGENDA erraria, que é pior de perceber.
    const parts = splitExpense([segment('pets', 0), segment('moradia', 100), segment('mercado', 90), segment('transporte', 80), segment('lazer', 70)], 340)
    assert.deepEqual(
      parts.map((part) => part.key),
      ['moradia', 'mercado', 'transporte', '__outras'],
    )
  })

  it('quando as fatias PASSAM do total, não há resto — e a barra fica acima do denominador', () => {
    // O caso raro que `finance.ts` descreve: um rateio que chega num mês sem a despesa
    // correspondente trava a categoria em zero, e a soma das fatias fica acima do total do mês.
    // Fica pinado porque é a única situação em que a soma daqui NÃO fecha, e alguém que a
    // encontre numa tela precisa saber se é defeito ou consequência conhecida.
    const parts = splitExpense([segment('moradia', 500), segment('mercado', 300)], 700)
    assert.equal(parts.length, 2)
    assert.equal(sum(parts), 800, 'acima do total, e de propósito')
  })

  it('a ordem chega PRONTA: `splitExpense` não ordena', () => {
    // Ele pega os três PRIMEIROS, não os três maiores. Quem chama passa a saída de
    // `summarizeByCategory`, que já vem ordenada do maior para o menor — e é essa precondição
    // que mantém "as maiores categorias" verdadeiro. Uma lista fora de ordem nomeia as erradas.
    const parts = splitExpense([segment('pets', 10), segment('moradia', 500), segment('mercado', 400), segment('lazer', 300)], 1210)
    assert.equal(parts[0].key, 'pets', 'entrou porque veio primeiro, não porque é a maior')
  })
})

describe('o volume de um mês', () => {
  it('o denominador é o MOVIMENTO, não a entrada', () => {
    // É por isso que a barra responde "quanto do movimento foi o quê" e não "as saídas passaram
    // das entradas?" — essa segunda leitura é a porcentagem do cabeçalho, e são coisas distintas.
    const volume = splitVolume(3000, 2000, [segment('moradia', 2000)])
    assert.equal(volume.total, 5000)
  })

  it('entrada zerada é AUSENTE, e não um bloco de largura nenhuma', () => {
    assert.equal(splitVolume(0, 500, [segment('moradia', 500)]).income, null)
  })

  it('entrada é SÓLIDA e saída é HACHURADA — a textura sozinha diz o lado', () => {
    // A mesma distinção do gráfico (§1 de `dataviz.md`), e é o que permite ler a barra sem
    // legenda: se as duas fossem sólidas, só a cor separaria entrada de saída.
    const volume = splitVolume(1000, 500, [segment('moradia', 500)])
    assert.equal(volume.income?.background, INCOME_VAR)
    assert.match(volume.expense[0].background, /repeating-linear-gradient/)
    assert.doesNotMatch(volume.expense[0].color, /gradient/, 'a cor CRUA sobrevive: o contorno da previsão não se pinta com listra')
  })
})

describe('o slot de cor é decidido UMA VEZ, sobre os três recortes', () => {
  it('a maior saída do conjunto fica com o primeiro slot', () => {
    assert.equal(categoryColor('moradia'), SERIES_VARS[0])
    assert.equal(categoryColor('mercado'), SERIES_VARS[1])
  })

  it('a categoria que só existe DENTRO de um recorte também ganha slot', () => {
    // "Retirada para o sócio" não existe no consolidado — ali ela é transferência. Se o ranking
    // olhasse só o consolidado, ela cairia no cinza de "Outras" num gráfico e receberia cor
    // emprestada no outro, e a mesma linha teria duas cores conforme a tela.
    assert.notEqual(categoryColor('retirada-pf'), OTHER_VAR, 'a retirada perdeu o slot próprio')
    assert.ok(SERIES_VARS.includes(categoryColor('retirada-pf')))
  })

  it('quem não cabe nos oito slots cai no cinza, e "outros" cai por decisão', () => {
    // O cinza não é falha: com nove categorias e oito cores, alguém tem de ser o resto. O que
    // não pode é uma cor ser reusada — duas séries com a mesma cor no mesmo gráfico.
    assert.equal(categoryColor('viagens'), OTHER_VAR, 'a nona categoria')
    assert.equal(categoryColor('outros'), OTHER_VAR)
    assert.equal(categoryColor('categoria-que-nao-existe'), OTHER_VAR)
    const slotted = ['moradia', 'mercado', 'transporte', 'retirada-pf', 'saude', 'restaurantes', 'assinaturas', 'compras'].map(categoryColor)
    assert.equal(new Set(slotted).size, 8, 'oito categorias, oito cores distintas')
  })
})
