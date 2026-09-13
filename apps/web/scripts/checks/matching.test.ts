import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlannedEntry, Receivable, Transaction } from '@wlet/domain'
import { matchesRule, matchPlanned, matchReceivables } from '@wlet/ingest/matching'

/**
 * O casamento de regra declarada contra o extrato — o que transforma "declarei aluguel" em "o
 * aluguel de março está pago".
 *
 * `packages/ingest` tem 2.664 linhas e só o `sha1` tinha teste. Este módulo é o de maior
 * consequência por linha: ele é PURO, e do resultado dele saem a agenda de Pagamentos, a de
 * Cobranças e o que a Previsão considera cumprido. Um casamento a menos não estoura — a tela
 * simplesmente diz que nove meses de aluguel estão vencidos, num conjunto que paga o aluguel todo
 * mês. É o defeito que o docblock do módulo registra ter acontecido.
 *
 * O `matchesRule` MUTA a transação (`tx.receivableId`, `tx.plannedId`), então cada teste monta as
 * suas — compartilhar um fixture faria o segundo teste ler o que o primeiro marcou.
 */
const tx = (over: Partial<Transaction> & { date: string; amount: number }): Transaction =>
  ({
    id: `t-${over.date}-${over.amount}`,
    merchant: over.merchant ?? 'FULANO DE TAL',
    rawDescription: over.rawDescription ?? over.merchant ?? 'FULANO DE TAL',
    accountId: over.accountId ?? 'conta-1',
    categoryId: over.categoryId ?? 'moradia',
    flow: over.amount > 0 ? 'income' : 'expense',
    month: over.date.slice(0, 7),
    ...over,
  }) as Transaction

describe('matchesRule', () => {
  it('casa pelo MERCHANT e também pela descrição crua', () => {
    // O defeito que o módulo registra: uma regra de categoria pode ter REESCRITO o estabelecimento
    // ("Pix enviado para Fulana…" virou "Aluguel"), e aí o nome que a pessoa reconhece no banco só
    // sobrevive na descrição. Testar só o merchant fazia o aluguel casar zero de nove meses.
    const rule = { merchants: ['FULANA'] }
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: -2000, merchant: 'FULANA SILVA' }), rule), true, 'pelo merchant')
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: -2000, merchant: 'Aluguel', rawDescription: 'PIX ENVIADO PARA FULANA SILVA' }), rule), true, 'pela descrição crua')
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: -2000, merchant: 'Aluguel', rawDescription: 'PIX ENVIADO PARA SICRANO' }), rule), false, 'nenhum dos dois')
  })

  it('a conta RESTRINGE quando declarada, e é livre quando ausente', () => {
    const anyAccount = { merchants: ['FULANO'] }
    const onlyOne = { merchants: ['FULANO'], accountId: 'conta-2' }
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 100, accountId: 'conta-1' }), anyAccount), true)
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 100, accountId: 'conta-1' }), onlyOne), false)
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 100, accountId: 'conta-2' }), onlyOne), true)
  })

  it('a faixa de valor compara o MÓDULO, e cada limite é opcional', () => {
    // A faixa existe para o caso do mesmo pagador que quita coisas diferentes. Ela precisa valer
    // para saída (negativa) do mesmo jeito, senão só filtraria metade do extrato.
    const withFloor = { merchants: ['FULANO'], amountBetween: { min: 500 } }
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: -2000 }), withFloor), true, 'saída acima do piso')
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: -120 }), withFloor), false, 'saída abaixo do piso')
    const withCeiling = { merchants: ['FULANO'], amountBetween: { max: 500 } }
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 120 }), withCeiling), true)
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 2000 }), withCeiling), false)
  })

  it('ignora acento e caixa nos dois lados', () => {
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 100, merchant: 'Padaria Jardim' }), { merchants: ['PADARIA JARDIM'] }), true)
    assert.equal(matchesRule(tx({ date: '2026-03-05', amount: 100, merchant: 'MERCADO SÃO JOÃO' }), { merchants: ['MERCADO SAO JOAO'] }), true)
  })
})

const receivableOf = (over: Partial<Receivable> = {}): Receivable =>
  ({
    id: 'r1',
    debtor: 'Mãe',
    label: 'Rateio',
    amount: 500,
    dueOn: { kind: 'day', day: 10 },
    recurrence: 'monthly',
    startMonth: '2026-01',
    match: { merchants: ['MAE'] },
    offsetsCategoryId: 'saude',
    ...over,
  }) as Receivable

describe('matchReceivables', () => {
  it('marca a entrada, conta os meses e soma o recebido', () => {
    const rows = [tx({ date: '2026-01-08', amount: 500, merchant: 'MAE' }), tx({ date: '2026-02-09', amount: 500, merchant: 'MAE' })]
    const { matches } = matchReceivables(rows, [receivableOf()])
    assert.deepEqual(matches[0].matched, ['2026-01', '2026-02'])
    assert.equal(matches[0].received, 1000)
    assert.deepEqual(
      rows.map((t) => t.receivableId),
      ['r1', 'r1'],
      'a transação fica marcada',
    )
  })

  it('SAÍDA não quita cobrança', () => {
    // Uma cobrança é dinheiro que ENTRA. Sem esta guarda, o Pix que você manda para a mesma
    // pessoa contaria como pagamento dela para você — e o valor recebido dobraria de sinal errado.
    const { matches } = matchReceivables([tx({ date: '2026-01-08', amount: -500, merchant: 'MAE' })], [receivableOf()])
    assert.deepEqual(matches[0].matched, [])
    assert.equal(matches[0].received, 0)
  })

  it('a janela PARA no último mês com extrato', () => {
    // Sem o limite, uma mensal sem prazo declararia em aberto todo mês até o fim dos tempos, e a
    // agenda de Cobranças nasceria com uma fila infinita de atrasos.
    const { matches } = matchReceivables([tx({ date: '2026-02-09', amount: 500, merchant: 'MAE' })], [receivableOf()])
    assert.deepEqual(matches[0].months, ['2026-01', '2026-02'])
  })

  it('parcelada vale `count` meses, contados a partir do início', () => {
    const { matches } = matchReceivables([tx({ date: '2026-06-01', amount: 1, merchant: 'ZZZ' })], [receivableOf({ recurrence: 'installments', count: 3 })])
    assert.deepEqual(matches[0].months, ['2026-01', '2026-02', '2026-03'])
  })

  it('uma entrada só quita UMA cobrança, e a segunda vira conflito', () => {
    // Duas regras sobrepostas fariam o mesmo dinheiro quitar duas dívidas. O conflito é reportado
    // em vez de silenciado porque é a única pista de que as janelas se cruzam.
    const rows = [tx({ date: '2026-01-08', amount: 500, merchant: 'MAE' })]
    const { matches, conflicts } = matchReceivables(rows, [receivableOf(), receivableOf({ id: 'r2' })])
    assert.equal(rows[0].receivableId, 'r1')
    assert.equal(matches[1].received, 0)
    assert.equal(conflicts.length, 1)
    assert.match(conflicts[0], /r2/)
  })
})

const plannedOf = (over: Partial<PlannedEntry> = {}): PlannedEntry =>
  ({
    id: 'p1',
    kind: 'expense',
    label: 'Aluguel',
    amount: 2000,
    categoryId: 'moradia',
    entity: 'PF',
    recurrence: 'monthly',
    startMonth: '2026-01',
    match: { merchants: ['FULANA'] },
    ...over,
  }) as PlannedEntry

describe('matchPlanned', () => {
  it('despesa casa com SAÍDA e soma em módulo', () => {
    const rows = [tx({ date: '2026-01-05', amount: -2000, merchant: 'FULANA' }), tx({ date: '2026-02-05', amount: -2000, merchant: 'FULANA' })]
    const { matches } = matchPlanned(rows, [plannedOf()])
    assert.deepEqual(matches[0].matched, ['2026-01', '2026-02'])
    assert.equal(matches[0].total, 4000, 'o total é positivo, mesmo vindo de saídas')
  })

  it('entrada prevista casa com ENTRADA, e não com saída', () => {
    const income = plannedOf({ id: 'p2', kind: 'income', label: 'Pró-labore' })
    assert.deepEqual(matchPlanned([tx({ date: '2026-01-05', amount: 8000, merchant: 'FULANA' })], [income]).matches[0].matched, ['2026-01'], 'a entrada cumpre')
    assert.deepEqual(matchPlanned([tx({ date: '2026-01-05', amount: -8000, merchant: 'FULANA' })], [income]).matches[0].matched, [], 'a saída não')
  })

  it('regra SEM `match` é só projeção e não casa nada', () => {
    // A ausência é a informação: sem `match`, a regra entra na previsão mas nunca vira conta a
    // pagar. Tratá-la como casamento vazio faria a tela cobrar um lançamento que ninguém declarou
    // como cobrável.
    const { matches } = matchPlanned([tx({ date: '2026-01-05', amount: -2000, merchant: 'FULANA' })], [plannedOf({ match: undefined })])
    assert.deepEqual(matches, [])
  })
})
