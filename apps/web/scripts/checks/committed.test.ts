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

describe('duas compras parecidas não se fundem', () => {
  /**
   * A chave da compra MUDOU, e esta prosa acompanha: ela é
   * `conta | data da compra | mês de origem | descrição crua | parcelas` (`@wlet/domain/purchases`).
   *
   * O `merchant` saiu de propósito — regra de categoria o reescreve, e mudar uma regra quebraria a
   * chave em silêncio. O valor também não entra: varia centavos entre parcelas (937,05 e 937,03).
   * Os testes daqui continuavam passando porque o fixture escreve `rawDescription` a partir do
   * `merchant`; o que estava errado era a EXPLICAÇÃO, e explicação errada num teste envelhece pior
   * que código errado — ela ensina a chave que não existe a quem vier depois.
   */
  it('um 3× e um 6× da mesma loja, no mesmo mês, são duas compras', () => {
    // Sem o total de parcelas na chave os dois virariam um só, e metade do contratado sumiria.
    const history = [parcela('2026-01', 1, 3, 100), parcela('2026-01', 1, 6, 200)]
    const { byMonth } = committedFor(history, ['2026-02'])
    assert.equal(byMonth.get('2026-02') ?? 0, 300, 'as duas projetam')
  })

  it('e duas compras IDÊNTICAS em datas diferentes também', () => {
    // O caso que a data da compra entrou para resolver, visto pelo lado do DINHEIRO: mesma
    // descrição crua, mesmo número de parcelas, mesmo mês de origem — só a data difere. É o caso
    // real da hospedagem estornada e recobrada, que tem a mesma `AIRBNB PAGAM*AIRB` das duas vezes.
    //
    // Pela chave antiga (`estabelecimento | parcelas | origem`) as duas colidiam e o mês projetava
    // UMA. O total certo é o dobro, e o erro seria de menos — o tipo que ninguém confere.
    const compra = (dia: string, amount: number) =>
      tx({
        month: '2026-01',
        amount: -amount,
        postedDate: `2026-01-${dia}`,
        id: `airbnb-${dia}`,
        merchant: 'AIRBNB PAGAM*AIRB',
        installment: { current: 1, total: 3 },
        invoice: { month: '2026-01' },
      } as never)
    const { byMonth } = committedFor([compra('04', 100), compra('20', 100)], ['2026-02'])
    assert.equal(byMonth.get('2026-02') ?? 0, 200, 'duas compras, não uma')
  })
  it('e o ESTABELECIMENTO não decide nada: a regra de categoria o reescreve', () => {
    // O contrário dos dois acima — aqui as parcelas TÊM de se juntar. `merchant` é campo derivado:
    // uma regra de categoria o reescreve, e duas parcelas da mesma compra podem sair com nomes
    // diferentes se a regra casar só uma delas. Com `merchant` na chave, a compra se parte em
    // duas e o mês projeta o DOBRO — sem nada errado à vista, porque as duas metades parecem
    // compras legítimas.
    //
    // Este caso é o que meu fixture não sabia exercitar: ele escrevia `rawDescription` a partir do
    // `merchant`, então os dois nunca divergiam e a mutação que trocava um pelo outro passava.
    // SEM `invoice`, e é essa escolha que faz o teste valer: com ela, o filtro da fatura mais
    // recente descarta a parcela 1/4 sozinho — as duas chaves dariam o mesmo total e a mutação
    // passaria. É a mesma armadilha do primeiro teste deste arquivo, encontrada do mesmo jeito.
    const bruta = 'PAGAMENTO*LOJA 12/34'
    const parcelaDe = (month: string, current: number, merchant: string) =>
      tx({ month, amount: -100, id: `${month}-${current}`, merchant, rawDescription: bruta, postedDate: '2026-01-04', installment: { current, total: 4 } } as never)
    const history = [parcelaDe('2026-01', 1, 'Loja'), parcelaDe('2026-02', 2, 'LOJA 12/34')]
    assert.equal(committedFor(history, ['2026-03']).byMonth.get('2026-03') ?? 0, 100, 'uma compra só — cem, não duzentos')
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
