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

  it('o vínculo com a compra atravessa: add, update e replaceAll preservam purchaseId', async () => {
    // O campo passa pelo Zod mesmo sem coluna — a requisição responde 200 e o insert não o menciona.
    // É o elo que só um teste contra o banco de verdade vê.
    const { context } = await comUsuario()
    const r = plansRouter(d)
    const created = await call(r.add, { label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided', purchaseId: 'db78e48a1935' }, { context })
    const id = created.items[0].id
    assert.equal(created.items[0].purchaseId, 'db78e48a1935')

    const edited = await call(r.update, { id, patch: { label: 'Airbnb Arraial' } }, { context })
    assert.equal(edited.items[0].purchaseId, 'db78e48a1935', 'o patch sem o campo não apaga o vínculo')

    const replaced = await call(r.replaceAll, { groups: [], items: [{ ...edited.items[0], purchaseId: '3e8b4c5881bc' }] }, { context })
    assert.equal(replaced.items[0].purchaseId, '3e8b4c5881bc')

    const unlinked = await call(r.replaceAll, { groups: [], items: [{ id, label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided' }] }, { context })
    assert.equal('purchaseId' in unlinked.items[0], false, 'sem vínculo, a chave não volta como null')
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

  /**
   * Uma COBRANÇA atravessa — e ela não tinha como atravessar.
   *
   * Dois defeitos moravam aqui, os dois escondidos por um `as never` no adapter do cliente:
   *
   * 1. `receivable.entity` era OBRIGATÓRIO no contrato, e o domínio (`Receivable`) não tem esse
   *    campo — de propósito: o lado de uma cobrança é derivado da conta que a quita. O cliente
   *    nunca o mandava, então a validação de entrada recusava o corpo INTEIRO com 400. Quem tivesse
   *    uma cobrança declarada não conseguia gravar configuração nenhuma.
   * 2. `match.amountBetween` era `z.tuple([number, number])` contra o `{ min?, max? }` do domínio.
   *    A configuração real usa `{ min: 200 }`, sem máximo — uma tupla não representa isso.
   *
   * Este teste é o que impede os dois de voltarem: ele monta a cobrança com a forma do DOMÍNIO, e
   * se o contrato divergir de novo ele não compila (o `as never` saiu de propósito).
   */
  it('uma cobrança atravessa com amountBetween só de MÍNIMO e sem entity', async () => {
    const { context } = await comUsuario()
    const r = configRouter(d)
    const volta = await call(
      r.replace,
      {
        accounts: [],
        selfNamePatterns: [],
        rules: [],
        planned: [],
        receivables: [
          {
            id: 'viagem-chile',
            label: 'Parcela da viagem',
            debtor: 'LUCAS MENDES PEREIRA',
            amount: 450.59,
            dueOn: { kind: 'day' as const, day: 10 },
            recurrence: 'installments' as const,
            startMonth: '2026-07',
            count: 6,
            // O piso SEM teto é o caso real: um rateio varia mês a mês, e exigir o número exato
            // deixaria a regra eternamente em aberto.
            match: { merchants: ['LUCAS MENDES PEREIRA'], accountId: 'xp-conta', amountBetween: { min: 200 } },
            offsetsCategoryId: 'viagens',
          },
        ],
        budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
        goals: [],
      },
      { context },
    )
    assert.equal(volta.receivables.length, 1)
    assert.deepEqual(volta.receivables[0].match.amountBetween, { min: 200 }, 'o mínimo sozinho tem de sobreviver à ida e à volta')
    assert.equal(volta.receivables[0].count, 6)
    // `entity` não foi mandado e NÃO pode voltar inventado: a coluna existe no banco por herança
    // do schema de lançamento previsto, e o domínio não tem o campo.
    assert.equal('entity' in volta.receivables[0], false, 'o que não foi declarado não volta')
  })

  /**
   * O teto do dia útil é 18, e o contrato tem de RECUSAR 19.
   *
   * Não é o máximo aritmético (um mês de 31 dias começando na segunda chega a 23): é o que o
   * validador em vigor aceita — `packages/ingest/src/pipeline.ts` recusa `nth > 18` e empurra o
   * lançamento para `plannedProblems`. Um contrato mais permissivo que o validador que o consome
   * troca "recusa no formulário" por "aceita, grava e some na ingestão", e aí o sintoma aparece
   * longe da causa.
   */
  it('recusa vencimento em dia útil acima de 18', async () => {
    const { context } = await comUsuario()
    const r = configRouter(d)
    const corpo = (nth: number) => ({
      accounts: [],
      selfNamePatterns: [],
      rules: [],
      planned: [
        {
          id: 'salario',
          kind: 'income' as const,
          label: 'Salário',
          amount: 5000,
          categoryId: 'renda-pf',
          entity: 'PF' as const,
          recurrence: 'monthly' as const,
          startMonth: '2026-01',
          dueOn: { kind: 'business-day' as const, nth },
        },
      ],
      receivables: [],
      budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
      goals: [],
    })
    const dentro = await call(r.replace, corpo(18), { context })
    assert.deepEqual(dentro.planned[0].dueOn, { kind: 'business-day', nth: 18 })
    await assert.rejects(() => call(r.replace, corpo(19), { context }), 'o contrato não pode aceitar o que o pipeline descarta')
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

/**
 * O isolamento por `userId` vale nos CINCO domínios, e não só nos dois que já tinham teste.
 *
 * É a garantia que mais importa neste app: ele guarda extrato bancário inteiro, e o eixo que separa
 * uma pessoa da outra é uma coluna. Medido antes de escrever isto: as 30 cláusulas `where` dos cinco
 * routers filtram por `userId` e as 15 escritas o gravam — está certo hoje. O que não havia era o que
 * mantém assim. `overrides` e `dataset` tinham teste; `config`, `plans` e `preferences` não, e são
 * justamente os que guardam o que a pessoa DECLAROU: as regras de categoria, o catálogo de compras,
 * o recorte que ela escolhe.
 *
 * Um vazamento aqui não estoura nada — a outra pessoa simplesmente vê números que não são dela.
 */
describe('o dado de uma pessoa não atravessa para outra', () => {
  it('configuração', async () => {
    const a = await comUsuario()
    const b = await comUsuario()
    const r = configRouter(d)
    const declarado = {
      accounts: [],
      selfNamePatterns: [{ source: 'FULANO', flags: 'i' }],
      rules: [{ id: 'mercado', test: { source: 'MERCADO', flags: 'i' }, category: 'mercado' }],
      planned: [],
      receivables: [],
      budget: { monthlyLimit: 9000, warnAt: 0.75, byCategory: [] },
      goals: [],
    }
    await call(r.replace, declarado as never, { context: a.context })

    const deB = await call(r.get, undefined, { context: b.context })
    assert.deepEqual(deB.rules, [], 'a regra de categoria de A apareceu para B')
    assert.deepEqual(deB.selfNamePatterns, [], 'o padrão de nome próprio de A apareceu para B')
    assert.notEqual(deB.budget.monthlyLimit, 9000, 'o teto de A apareceu para B')
  })

  it('planos', async () => {
    const a = await comUsuario()
    const b = await comUsuario()
    const r = plansRouter(d)
    await call(r.addGroup, { label: 'Viagem' } as never, { context: a.context })
    await call(r.add, { label: 'Passagem', cash: 2000, categoryId: 'viagem', status: 'considering' } as never, { context: a.context })

    const deB = await call(r.list, undefined, { context: b.context })
    assert.deepEqual(deB.items, [], 'o plano de A apareceu para B')
    assert.deepEqual(deB.groups, [], 'o grupo de A apareceu para B')
  })

  it('preferências', async () => {
    const a = await comUsuario()
    const b = await comUsuario()
    const r = preferencesRouter(d)
    await call(r.set, { scope: 'PJ', theme: 'dark' }, { context: a.context })

    const deB = await call(r.get, undefined, { context: b.context })
    assert.equal(deB.scope, null, 'o recorte de A apareceu para B')
    assert.equal(deB.theme, null, 'o tema de A apareceu para B')
  })
})
