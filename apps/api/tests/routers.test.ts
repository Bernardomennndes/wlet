import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { call } from '@orpc/server'
import { configRouter } from '../src/routers/config'
import { datasetRouter } from '../src/routers/dataset'
import { overridesRouter } from '../src/routers/overrides'
import { plansRouter } from '../src/routers/plans'
import { preferencesRouter } from '../src/routers/preferences'
import { db, limpar, novoUsuario } from './support'

/**
 * Os handlers são exercitados por `call`, sem subir HTTP.
 *
 * A camada de transporte já é do oRPC e do Hono, e testá-la aqui seria testar bibliotecas. O que
 * é NOSSO é o que cada handler faz com o banco — e é isso que estes testes olham, contra um
 * Postgres de verdade e não contra um dublê: metade dos defeitos deste servidor eram de
 * serialização e de `onConflict`, coisas que um fake nunca teria mostrado.
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
  return { context: { userId: u.userId }, userId: u.userId }
}

describe('preferências', () => {
  it('quem nunca escolheu recebe os três NULOS, não um objeto vazio', async () => {
    const { context } = await comUsuario()
    assert.deepEqual(await call(preferencesRouter(d).get, undefined, { context }), { scope: null, period: null, theme: null })
  })

  it('gravar uma preferência NÃO apaga as outras', async () => {
    // O defeito que a validação de saída pegou em produção: o `get` devolvia o objeto do banco
    // cru, e ele nasce `{}` quando a configuração é gravada antes de qualquer preferência.
    const { context } = await comUsuario()
    const r = preferencesRouter(d)
    await call(r.set, { scope: 'PJ' }, { context })
    const depois = await call(r.set, { theme: 'dark' }, { context })
    assert.equal(depois.scope, 'PJ')
    assert.equal(depois.theme, 'dark')
  })
})

/**
 * Os ids aqui têm a FORMA do que o ingest emite — doze hexadecimais, o `sha1` cortado.
 *
 * Eram `'abc123'`, `'x'` e `'compartilhado'`, e passavam: o contrato aceitava `z.string()` cru.
 * Fixture que o servidor real recusaria prova menos do que parece — foi assim que um espaço de
 * chave errado atravessou uma suíte verde neste repositório.
 */
const ID_A = 'a1b2c3d4e5f6'
const ID_B = '0f1e2d3c4b5a'

describe('ajustes de categoria', () => {
  it('grava, lê e REMOVE com nulo', async () => {
    const { context } = await comUsuario()
    const r = overridesRouter(d)
    assert.deepEqual(await call(r.list, undefined, { context }), {})
    await call(r.set, { transactionId: ID_A, categoryId: 'mercado' }, { context })
    assert.deepEqual(await call(r.list, undefined, { context }), { [ID_A]: 'mercado' })
    // `null` é "volte ao que o ingest decidiu" — diferente de gravar categoria vazia.
    assert.deepEqual(await call(r.set, { transactionId: ID_A, categoryId: null }, { context }), {})
  })

  it('recusa id que não tem a forma do que o ingest emite', async () => {
    // A tabela `overrides` não tem chave estrangeira de propósito — o ajuste sobrevive a uma
    // reingestão —, então nada mais no caminho recusaria uma chave inventada: ela entraria e
    // ficaria órfã para sempre.
    const { context } = await comUsuario()
    await assert.rejects(() => call(overridesRouter(d).set, { transactionId: 'abc', categoryId: 'mercado' }, { context }))
  })

  it('regravar o mesmo id SUBSTITUI, não duplica', async () => {
    const { context } = await comUsuario()
    const r = overridesRouter(d)
    await call(r.set, { transactionId: ID_B, categoryId: 'mercado' }, { context })
    const depois = await call(r.set, { transactionId: ID_B, categoryId: 'lazer' }, { context })
    assert.deepEqual(depois, { [ID_B]: 'lazer' })
  })

  it('o ajuste de uma pessoa NÃO aparece para outra', async () => {
    // A garantia que mais importa neste app: o eixo `userId` isolando extratos.
    const a = await comUsuario()
    const b = await comUsuario()
    const r = overridesRouter(d)
    await call(r.set, { transactionId: ID_A, categoryId: 'mercado' }, { context: a.context })
    assert.deepEqual(await call(r.list, undefined, { context: b.context }), {})
  })
})

describe('planos', () => {
  it('cria, edita e remove', async () => {
    const { context } = await comUsuario()
    const r = plansRouter(d)
    const criado = await call(r.add, { label: 'Notebook', categoryId: 'compras', cash: 3000, status: 'considering' }, { context })
    assert.equal(criado.items.length, 1)
    const id = criado.items[0].id
    const editado = await call(r.update, { id, patch: { status: 'decided' } }, { context })
    assert.equal(editado.items[0].status, 'decided')
    assert.equal(editado.items[0].cash, 3000, 'o patch não apaga o que não veio nele')
    assert.equal((await call(r.remove, { id }, { context })).items.length, 0)
  })

  it('apagar um grupo NÃO apaga os planos dele', async () => {
    // A regra que o serviço do navegador já tinha, e que vale igual aqui.
    const { context } = await comUsuario()
    const r = plansRouter(d)
    const g = await call(r.addGroup, { label: 'Casa' }, { context })
    const grupoId = g.groups[0].id
    await call(r.add, { label: 'Sofá', categoryId: 'compras', cash: 2000, status: 'considering', groupId: grupoId }, { context })
    const depois = await call(r.removeGroup, { id: grupoId }, { context })
    assert.equal(depois.groups.length, 0)
    assert.equal(depois.items.length, 1, 'o plano sobrevive ao grupo')
    assert.equal(depois.items[0].groupId, undefined, 'e perde o grupo, em vez de apontar para o que sumiu')
  })
})

describe('configuração', () => {
  it('as RegExp sobrevivem à ida e à volta', async () => {
    // `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum. Se a travessia falhar, a regra chega
    // vazia do outro lado e nada acusa — a categorização simplesmente para de funcionar.
    const { context } = await comUsuario()
    const r = configRouter(d)
    const entrada = {
      accounts: [],
      selfNamePatterns: [{ source: 'FULANO', flags: 'i' }],
      rules: [{ id: 'mercado', test: { source: 'SUPERMERCADO|MERCADO ', flags: 'i' }, category: 'mercado' }],
      planned: [],
      receivables: [],
      budget: { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] },
      goals: [],
    }
    const volta = await call(r.replace, entrada as never, { context })
    assert.deepEqual(volta.rules[0].test, { source: 'SUPERMERCADO|MERCADO ', flags: 'i' })
    assert.deepEqual(volta.selfNamePatterns[0], { source: 'FULANO', flags: 'i' })
  })

  it('grava lançamento previsto com os opcionais AUSENTES, não nulos', async () => {
    // Sem `match` a regra é só projeção; com ele, vira conta a pagar. A ausência é a informação.
    const { context } = await comUsuario()
    const r = configRouter(d)
    const volta = await call(
      r.replace,
      {
        accounts: [],
        selfNamePatterns: [],
        rules: [],
        planned: [{ id: 'aluguel', kind: 'expense', label: 'Aluguel', amount: 1500, categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01' }],
        receivables: [],
        budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
        goals: [],
      } as never,
      { context },
    )
    assert.equal(volta.planned[0].amount, 1500)
    assert.equal('match' in volta.planned[0], false, 'sem credor, o campo não existe')
  })
})

/**
 * Um conjunto MÍNIMO e completo — as cinco partes, uma conta e um lançamento.
 *
 * Ele existe para exercitar o caminho da IMPORTAÇÃO, que é o único que grava um conjunto sem
 * rodar o pipeline. Montá-lo à mão é o ponto: se o contrato ganhar um campo obrigatório, este
 * literal para de compilar — que é exatamente o que se quer de um teste do contrato.
 */
const conjunto = {
  accounts: [
    {
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
    },
  ],
  meta: {
    generatedAt: '2026-01-31T12:00:00.000Z',
    sourceFiles: [{ path: 'docs/inter.ofx', account: 'inter-pj', transactions: 1, skippedAsDuplicate: false }],
    totals: { transactions: 1, transfers: 0, accounts: 1 },
    months: ['2026-01'],
  },
  transactions: [
    {
      id: 'a1b2c3d4e5f6',
      accountId: 'inter-pj',
      entity: 'PJ' as const,
      date: '2026-01-10',
      postedDate: '2026-01-10',
      amount: -123.45,
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
    },
  ],
  transfers: [],
  investments: { snapshot: null, series: [], income: [] },
}

describe('conjunto', () => {
  it('importar GRAVA o conjunto, sem reingerir', async () => {
    // O no-op que este teste fecha: o repositório remoto tinha `save` vazio, então importar um
    // pacote descartava o conjunto inteiro e a tela dizia "Importado".
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    assert.equal(await call(r.get, undefined, { context }), null, 'quem nunca importou não tem conjunto')

    assert.deepEqual(await call(r.replace, conjunto, { context }), { ok: true })
    const lido = await call(r.get, undefined, { context })
    assert.equal(lido?.transactions.length, 1)
    // O id tem de SOBREVIVER: é ele que chaveia os ajustes manuais de categoria.
    assert.equal(lido?.transactions[0].id, 'a1b2c3d4e5f6')
    assert.equal(lido?.transactions[0].amount, -123.45, 'o valor volta como número, não como texto do `numeric`')
    assert.equal(lido?.accounts[0].coverage?.to, '2026-01-31')
  })

  it('os arquivos-fonte voltam COM conteúdo, um a um', async () => {
    // Sem esta rota, exportar gerava um pacote com `sources: []` — e o destino ficava sem o que
    // reprocessar, porque a listagem só devolvia metadado.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    const conteudo = Buffer.from('OFXHEADER:100\nDATA').toString('base64')

    assert.deepEqual(await call(r.writeSources, { sources: [{ path: 'docs/inter.ofx', contentBase64: conteudo }] }, { context }), { ok: true })

    const listados = await call(r.sources, undefined, { context })
    assert.equal(listados.length, 1)
    assert.equal(listados[0].path, 'docs/inter.ofx')
    assert.equal('contentBase64' in listados[0], false, 'a listagem não move megabytes')

    assert.deepEqual(await call(r.sourceContent, { path: 'docs/inter.ofx' }, { context }), { path: 'docs/inter.ofx', contentBase64: conteudo })
    // Caminho que não está guardado é estado previsto, não falha: listar e buscar são duas
    // requisições, e quem exporta pula o que sumiu entre uma e outra.
    assert.equal(await call(r.sourceContent, { path: 'docs/sumiu.ofx' }, { context }), null)
  })

  it('repor a pasta SUBSTITUI a anterior', async () => {
    // Um extrato que a pessoa apagou não pode continuar produzindo lançamentos na reingestão.
    const { context } = await comUsuario()
    const r = datasetRouter(d)
    await call(r.writeSources, { sources: [{ path: 'docs/velho.ofx', contentBase64: 'dmVsaG8=' }] }, { context })
    await call(r.writeSources, { sources: [{ path: 'docs/novo.ofx', contentBase64: 'bm92bw==' }] }, { context })
    const listados = await call(r.sources, undefined, { context })
    assert.deepEqual(
      listados.map((f) => f.path),
      ['docs/novo.ofx'],
    )
  })

  it('o conjunto de uma pessoa NÃO aparece para outra', async () => {
    const a = await comUsuario()
    const b = await comUsuario()
    const r = datasetRouter(d)
    await call(r.replace, conjunto, { context: a.context })
    assert.equal(await call(r.get, undefined, { context: b.context }), null)
  })
})
