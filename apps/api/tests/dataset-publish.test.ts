import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { call } from '@orpc/server'
import { datasetRouter } from '../src/routers/dataset'
import { overridesRouter } from '../src/routers/overrides'
import { db, limpar, novoUsuario } from './support'

/**
 * A PUBLICAÇÃO de um conjunto — os três defeitos que só aparecem com dado de verdade.
 *
 * Os testes que já existiam publicam UM lançamento, e um lançamento não exercita nada do que o
 * módulo se preocupa em garantir: o lote de 500, a transação, e a sobrevivência dos ids. Os três
 * têm o mesmo formato de falha — passam em desenvolvimento e quebram no extrato real de alguém.
 */
const d = db()
const criados: string[] = []
after(async () => {
  for (const id of criados) await limpar(d, id)
  await d.close()
})

const comUsuario = async () => {
  const u = await novoUsuario(d)
  criados.push(u.userId)
  return { context: { userId: u.userId } }
}

const conta = {
  id: 'inter-pj',
  name: 'Inter PJ',
  bank: 'Inter',
  bankCode: '077',
  type: 'checking' as const,
  entity: 'PJ' as const,
  holder: 'Fulano',
  externalId: '9988776',
  coverage: { from: '2026-01-01', to: '2026-01-31' },
  reportedBalance: null,
  sources: ['docs/inter.ofx'],
  transactionCount: 1,
}

const lancamento = (id: string, amount = -10.5) => ({
  id,
  accountId: 'inter-pj',
  entity: 'PJ' as const,
  date: '2026-01-10',
  postedDate: '2026-01-10',
  amount,
  description: 'Mercado',
  rawDescription: 'MERCADO X LTDA',
  merchant: 'Mercado X',
  kind: 'statement' as const,
  categoryId: 'mercado',
  categoryRule: 'mercado',
  installment: null,
  invoice: null,
  transferId: null,
  transferKind: null,
  counterpartAccountId: null,
  receivableId: null,
  plannedId: null,
  source: 'docs/inter.ofx',
  fitId: null,
})

const conjunto = (transacoes: ReturnType<typeof lancamento>[]) => ({
  accounts: [{ ...conta, transactionCount: transacoes.length }],
  meta: {
    generatedAt: '2026-01-31T12:00:00.000Z',
    sourceFiles: [{ path: 'docs/inter.ofx', account: 'inter-pj', transactions: transacoes.length, skippedAsDuplicate: false }],
    totals: { transactions: transacoes.length, transfers: 0, accounts: 1 },
    months: ['2026-01'],
  },
  transactions: transacoes,
  transfers: [],
  investments: { snapshot: null, series: [], income: [] },
})

/** Ids com a forma do que o ingest emite: doze hexadecimais, o `sha1` cortado. */
const idDe = (n: number) => n.toString(16).padStart(12, '0')

describe('o lote de 500 não é otimização — é o limite do Postgres', () => {
  it('três mil lançamentos atravessam INTEIROS', async () => {
    // Um `insert` só, com 3.000 linhas de 23 colunas, pede 69.000 parâmetros — acima dos 65.535
    // que o protocolo aceita. O conjunto real que motivou o lote tinha 5.694 lançamentos, e o
    // erro NÃO aparece em desenvolvimento: um extrato de teste com dez linhas passa liso, e a
    // primeira importação de verdade falha inteira.
    //
    // Três mil é escolhido para cruzar o limite de propósito: com 500 o teste passaria com o
    // lote desligado e não provaria nada.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    const transacoes = Array.from({ length: 3000 }, (_, i) => lancamento(idDe(i), -(i + 1) / 100))

    assert.deepEqual(await call(r.replace, conjunto(transacoes), { context }), { ok: true })

    const lido = await call(r.get, undefined, { context })
    assert.equal(lido?.transactions.length, 3000)
    // As pontas, e uma do meio de um lote: um lote perdido sairia como um buraco no meio, não
    // como uma lista curta — e a contagem sozinha poderia fechar por acaso noutro arranjo.
    const ids = new Set(lido?.transactions.map((t) => t.id))
    for (const n of [0, 499, 500, 1500, 2999]) assert.ok(ids.has(idDe(n)), `o lançamento ${n} sumiu`)
  })

  it('e o dinheiro atravessa em CENTAVOS, não em ponto flutuante', async () => {
    // O `numeric` do Postgres vai e volta como string de propósito. Somar os três mil valores
    // aqui é a conferência que o `toMoney`/`money` existe para permitir.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    const transacoes = Array.from({ length: 600 }, (_, i) => lancamento(idDe(i), -1179.4))
    await call(r.replace, conjunto(transacoes), { context })
    const lido = await call(r.get, undefined, { context })
    const soma = lido?.transactions.reduce((total, t) => total + t.amount, 0) ?? 0
    assert.equal(Math.round(soma * 100) / 100, -707640)
  })

  it('e quem arredonda o MEIO CENTAVO é o `toMoney`, não o Postgres', () => {
    // Medido, porque a mutação primeiro pareceu inofensiva: o driver aceita número e o valor
    // chega igual na maioria dos casos. O meio centavo é onde os dois discordam, e discordam
    // para lados OPOSTOS — `toFixed(2)` decide pelo binário real (−0,015 é um tiquinho MENOS
    // que −0,015, e vira −0,01) enquanto o `numeric` arredonda o literal decimal afastando do
    // zero (−0,02). Tirar o `toMoney` parece limpeza e move meio centavo por linha, para o outro
    // lado, em todo lançamento com mais de duas casas.
    //
    // Não é hipótese: valor com três casas nasce de divisão — um total dividido em parcelas.
    assert.equal((-0.015).toFixed(2), '-0.01')
    assert.equal((-123.455).toFixed(2), '-123.45')
  })

  it('o conjunto INTEIRO volta com os valores que entraram', async () => {
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    const amounts = [-1234567.89, -0.015, -123.455, -0.1 - 0.2]
    await call(r.replace, conjunto(amounts.map((v, i) => lancamento(idDe(i), v))), { context })
    const lido = await call(r.get, undefined, { context })
    assert.deepEqual(
      lido?.transactions
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((t) => t.amount),
      [-1234567.89, -0.01, -123.45, -0.3],
      'o arredondamento é o do `toMoney`; o do Postgres daria -0,02 e -123,46',
    )
  })
})

describe('meio conjunto gravado é pior que nenhum', () => {
  it('uma publicação que falha no meio deixa o conjunto ANTERIOR de pé', async () => {
    // A publicação apaga o conjunto antigo ANTES de inserir o novo, e é só a transação que
    // impede isso de virar perda de dado. Sem ela, um erro na inserção deixaria a pessoa sem
    // extrato nenhum — e o erro chega da forma mais banal: um id repetido no pacote importado.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    await call(r.replace, conjunto([lancamento('aaaaaaaaaaaa', -100)]), { context })

    const repetido = conjunto([lancamento('bbbbbbbbbbbb', -1), lancamento('bbbbbbbbbbbb', -2)])
    await assert.rejects(() => call(r.replace, repetido, { context }))

    const lido = await call(r.get, undefined, { context })
    assert.equal(lido?.transactions.length, 1, 'o conjunto antigo continua lá')
    assert.equal(lido?.transactions[0].id, 'aaaaaaaaaaaa')
    assert.equal(lido?.transactions[0].amount, -100)
  })
})

describe('os ids sobrevivem à importação — e é isso que segura os ajustes', () => {
  it('o ajuste manual continua casando com o lançamento depois de reimportar', async () => {
    // O `transaction.id` é `sha1` de sete campos, e os ajustes de categoria são chaveados por
    // ele. Reingerir na importação trocaria todo id, e os ajustes virariam órfãos EM SILÊNCIO:
    // nada quebra, a tabela continua cheia, e as categorias ajustadas à mão simplesmente voltam
    // ao que o ingest decidiu.
    const { context } = await comUsuario()
    const conjuntoRouter = datasetRouter(d)
    const ajustes = overridesRouter(d)

    await call(conjuntoRouter.replace, conjunto([lancamento('a1b2c3d4e5f6')]), { context })
    await call(ajustes.set, { transactionId: 'a1b2c3d4e5f6', categoryId: 'lazer' }, { context })

    // O mesmo pacote de novo, como quem reimporta depois de exportar.
    await call(conjuntoRouter.replace, conjunto([lancamento('a1b2c3d4e5f6')]), { context })

    const lido = await call(conjuntoRouter.get, undefined, { context })
    assert.equal(lido?.transactions[0].id, 'a1b2c3d4e5f6', 'o id é o mesmo')
    assert.deepEqual(await call(ajustes.list, undefined, { context }), { a1b2c3d4e5f6: 'lazer' }, 'e o ajuste ainda o encontra')
  })

  it('republicar SUBSTITUI: o que saiu do pacote sai do conjunto', async () => {
    // Substituir e não reconciliar. Um `diff` aqui inventaria uma semântica de merge que o
    // contrato não declara, e um extrato apagado continuaria produzindo lançamentos.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    await call(r.replace, conjunto([lancamento('aaaaaaaaaaaa'), lancamento('bbbbbbbbbbbb')]), { context })
    await call(r.replace, conjunto([lancamento('bbbbbbbbbbbb')]), { context })
    const lido = await call(r.get, undefined, { context })
    assert.deepEqual(
      lido?.transactions.map((t) => t.id),
      ['bbbbbbbbbbbb'],
    )
  })
})
