import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { call } from '@orpc/server'
import { configRouter } from '../src/routers/config'
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

describe('ajustes de categoria', () => {
  it('grava, lê e REMOVE com nulo', async () => {
    const { context } = await comUsuario()
    const r = overridesRouter(d)
    assert.deepEqual(await call(r.list, undefined, { context }), {})
    await call(r.set, { transactionId: 'abc123', categoryId: 'mercado' }, { context })
    assert.deepEqual(await call(r.list, undefined, { context }), { abc123: 'mercado' })
    // `null` é "volte ao que o ingest decidiu" — diferente de gravar categoria vazia.
    assert.deepEqual(await call(r.set, { transactionId: 'abc123', categoryId: null }, { context }), {})
  })

  it('regravar o mesmo id SUBSTITUI, não duplica', async () => {
    const { context } = await comUsuario()
    const r = overridesRouter(d)
    await call(r.set, { transactionId: 'x', categoryId: 'mercado' }, { context })
    const depois = await call(r.set, { transactionId: 'x', categoryId: 'lazer' }, { context })
    assert.deepEqual(depois, { x: 'lazer' })
  })

  it('o ajuste de uma pessoa NÃO aparece para outra', async () => {
    // A garantia que mais importa neste app: o eixo `userId` isolando extratos.
    const a = await comUsuario()
    const b = await comUsuario()
    const r = overridesRouter(d)
    await call(r.set, { transactionId: 'compartilhado', categoryId: 'mercado' }, { context: a.context })
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
