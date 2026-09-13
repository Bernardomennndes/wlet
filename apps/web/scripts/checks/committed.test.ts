import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setDataset, setDeclarations } from '@/lib/dataset'
import type { ViewTransaction } from '@/lib/finance'

/**
 * O PORTÃO DE BOOT precisa ser semeado antes do import, e é por isso que ele é dinâmico.
 *
 * `forecast.ts` importa `BUDGET` de `./budget`, que lê `declarations()` na própria avaliação do
 * módulo — então um `import` estático aqui estoura com "declarations() foi chamado antes do boot".
 * É o custo declarado da decisão do portão, que o `CLAUDE.md` registra: migrar de verdade exigiria
 * `finance.ts` parar de ser um módulo de constantes.
 *
 * O efeito colateral é que este módulo ficou SEM TESTE por ser difícil de importar, não por ser
 * difícil de testar — as funções em si são puras. Semear o portão com o mínimo custa três linhas.
 */
setDataset({ transactions: [], accounts: [], transfers: [], investments: null, meta: { months: [] } } as never)
setDeclarations({ planned: [], budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, receivables: [], goals: [], accounts: [], rules: [], selfNamePatterns: [] } as never)

const { committedFor } = await import('@/lib/forecast')

/**
 * As parcelas JÁ CONTRATADAS que ainda vão cair — o "já contratado" da Previsão.
 *
 * `forecast.ts` tem 469 linhas e nenhum teste, e é o maior módulo consequente que restava: dele
 * sai quanto você terá em cada mês futuro. Este arquivo cobre a parte que não é declaração — as
 * parcelas de cartão já compradas, que entram sozinhas porque são FATO.
 *
 * As duas regras abaixo estão no módulo com o número que custaram, e é por isso que elas vêm
 * primeiro: as duas produzem erro de DINHEIRO que não estoura, só mostra um total errado.
 */
const tx = (over: Partial<ViewTransaction> & { month: string; amount: number }): ViewTransaction =>
  ({
    id: `${over.month}-${over.amount}-${over.merchant ?? ''}-${over.installment?.current ?? 0}`,
    date: `${over.month}-05`,
    merchant: over.merchant ?? 'LOJA',
    rawDescription: over.merchant ?? 'LOJA',
    accountId: over.accountId ?? 'cartao-1',
    categoryId: over.categoryId ?? 'compras',
    displayCategoryId: over.categoryId ?? 'compras',
    flow: 'expense',
    ...over,
  }) as ViewTransaction

/** Uma parcela de cartão: ela vive numa FATURA, e é a fatura que diz se a série continua. */
const parcela = (month: string, current: number, total: number, amount = 100, over: Partial<ViewTransaction> = {}) =>
  tx({ month, amount: -amount, installment: { current, total }, invoice: { month }, ...over } as never)

describe('só a ÚLTIMA parcela vista projeta', () => {
  it('uma compra que aparece em três faturas conta UMA vez, não três', () => {
    // A regra que custou o dobro: uma compra parcelada aparece numa fatura por mês, e cada
    // aparição traz consigo as parcelas que ainda faltam. Projetar a partir de todas conta a
    // mesma compra várias vezes — medido no conjunto real, "117 linhas de parcela para 31
    // compras, e um 'já contratado' de R$ 6.200,00 no lugar dos R$ 3.100,00 reais".
    const history = [parcela('2026-01', 1, 4), parcela('2026-02', 2, 4), parcela('2026-03', 3, 4)]
    const { byMonth } = committedFor(history, ['2026-04'])

    // Da 3ª parcela em março sobra UMA: a 4ª, em abril. Cem reais, não trezentos.
    assert.equal(byMonth.get('2026-04') ?? 0, 100)
  })

  it('e a deduplicação é a ÚNICA guarda quando não há fatura', () => {
    // Este caso existe porque o anterior passava pelo MOTIVO ERRADO, e a falsificação mostrou:
    // com `invoice` preenchida, o filtro da fatura mais recente já descarta as aparições antigas,
    // então desligar a deduplicação não mudava nada. Sem `invoice` — `undefined !== undefined` é
    // falso, e o filtro não se aplica — quem protege é só a deduplicação por compra.
    //
    // Um cartão sem mês de fatura no extrato é o caso real disto: o parcelamento aparece como
    // lançamento comum, e as três aparições contariam três vezes.
    const semFatura = (month: string, current: number, total: number) => tx({ month, amount: -100, installment: { current, total } } as never)
    const history = [semFatura('2026-01', 1, 4), semFatura('2026-02', 2, 4), semFatura('2026-03', 3, 4)]
    assert.equal(committedFor(history, ['2026-04']).byMonth.get('2026-04') ?? 0, 100, 'cem, não trezentos')
  })

  it('e as parcelas restantes caem nos meses certos, uma por mês', () => {
    const history = [parcela('2026-01', 1, 4)]
    const { byMonth } = committedFor(history, ['2026-02', '2026-03', '2026-04', '2026-05'])
    assert.deepEqual(
      [...byMonth].sort(),
      [
        ['2026-02', 100],
        ['2026-03', 100],
        ['2026-04', 100],
      ],
      'três restantes, e nada em maio — a série termina na 4ª',
    )
  })
})

describe('a série só continua se apareceu na fatura MAIS RECENTE', () => {
  it('compra que parou de aparecer não projeta mais', () => {
    // Se a série parou enquanto os extratos seguiram vindo, ela acabou: estorno, quitação
    // antecipada, cancelamento. O módulo registra o caso — uma hospedagem em 6x de maio,
    // estornada em julho e recobrada como outro 6x, projetava R$ 890,00 em outubro.
    const history = [
      parcela('2026-01', 1, 6, 890, { merchant: 'HOSPEDAGEM' }),
      // o cartão seguiu tendo faturas, mas a hospedagem sumiu delas
      parcela('2026-02', 1, 2, 50, { merchant: 'OUTRA COISA' }),
      parcela('2026-03', 2, 2, 50, { merchant: 'OUTRA COISA' }),
    ]
    const { byCategory } = committedFor(history, ['2026-04', '2026-05', '2026-06'])
    const total = [...(byCategory.get('compras') ?? [])].reduce((sum, [, value]) => sum + value, 0)
    assert.equal(total, 0, 'nem a hospedagem abandonada nem a série já encerrada projetam')
  })

  it('mas a que segue na fatura mais recente continua', () => {
    const history = [parcela('2026-01', 1, 3, 890, { merchant: 'HOSPEDAGEM' }), parcela('2026-02', 2, 3, 890, { merchant: 'HOSPEDAGEM' })]
    const { byMonth } = committedFor(history, ['2026-03'])
    assert.equal(byMonth.get('2026-03') ?? 0, 890)
  })
})

describe('duas compras do mesmo estabelecimento não se fundem', () => {
  it('a identidade é estabelecimento + total de parcelas + mês de origem', () => {
    // Recuar `current - 1` meses leva toda parcela da mesma compra ao mesmo mês de origem.
    // Sem o total de parcelas na chave, um 3x e um 6x da mesma loja no mesmo mês virariam um só
    // — e metade do contratado sumiria do total.
    const history = [parcela('2026-01', 1, 3, 100), parcela('2026-01', 1, 6, 200)]
    const { byMonth } = committedFor(history, ['2026-02'])
    assert.equal(byMonth.get('2026-02') ?? 0, 300, 'as duas projetam')
  })
})

describe('o que NÃO é parcela fica de fora', () => {
  it('lançamento à vista não projeta nada', () => {
    // Só parcela entra aqui. Uma regra de "todo mês entra tal valor" num mês que já tem extrato
    // contaria de novo o que de fato aconteceu.
    const { byMonth } = committedFor([tx({ month: '2026-01', amount: -500, invoice: { month: '2026-01' } } as never)], ['2026-02'])
    assert.equal(byMonth.size, 0)
  })

  it('entrada não projeta, mesmo parcelada', () => {
    const history = [parcela('2026-01', 1, 3, 100, { flow: 'income', amount: 100 } as never)]
    assert.equal(committedFor(history, ['2026-02']).byMonth.size, 0)
  })

  it('mês fora da janela pedida não entra', () => {
    const { byMonth } = committedFor([parcela('2026-01', 1, 6)], ['2026-02'])
    assert.deepEqual([...byMonth.keys()], ['2026-02'], 'só o mês pedido, embora haja cinco restantes')
  })
})
