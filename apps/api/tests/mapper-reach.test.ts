import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { call } from '@orpc/server'
import { plan, planGroup } from '@wlet/api/domains/plans/shape'
import { plansRouter } from '../src/routers/plans'
import { db, limpar, novoUsuario } from './support'

/**
 * O MAPEADOR — o elo da cadeia que nenhum sensor de forma enxerga.
 *
 * `wire-shape.test.ts` compara domínio com contrato; `db-columns.test.ts` compara contrato com
 * coluna. As duas olham DECLARAÇÕES, e entre elas passa o `apps/api/src/routers/plans.ts`, que é
 * código à mão: `toPlan` monta o objeto a partir da linha e `values` monta a linha a partir do
 * objeto. Um campo pode estar declarado nos três lugares e ser esquecido nos dois — o Zod aceita
 * a requisição, o insert não menciona a coluna, a resposta vem 200, e o dado some.
 *
 * Não é hipótese: é como `PlanGroup.from/to/note` se perdeu, e o `CLAUDE.md` guarda a medida —
 * enviado `{id,label,from,to,note}`, voltou `{id,label}`.
 *
 * O que fecha a cadeia é este arquivo ser guiado pelo CONTRATO e não por uma lista minha. Quem
 * acrescentar um campo a `shape.ts` e esquecer o mapeador encontra vermelho sem ter escrito teste
 * nenhum — e quem acrescentar o campo e o mapeador encontra vermelho no primeiro teste, que pede
 * o campo no fixture. As duas portas levam à mesma leitura do código.
 */
const d = db()
const created: string[] = []
after(async () => {
  for (const id of created) await limpar(d, id)
  await d.close()
})

/**
 * Um plano com TODOS os campos do contrato preenchidos, cada um com um valor distinguível.
 *
 * Valores genéricos (`'x'`, `1`) não servem: um mapeador que troque dois campos de lugar passaria.
 * Cada um aqui só pode ter vindo de si mesmo.
 */
const full = (groupId: string) => ({
  id: 'plan-cheio',
  label: 'Notebook 14"',
  categoryId: 'compras',
  cash: 8432.17,
  financed: { total: 9180.5, installments: 12 },
  payment: 'financed' as const,
  month: '2026-07',
  groupId,
  purchaseId: 'db78e48a1935',
  status: 'decided' as const,
})

describe('todo campo que o contrato declara atravessa o banco', () => {
  it('o fixture cobre o contrato INTEIRO — é isto que faz o resto valer', () => {
    // Sem esta verificação o arquivo vira uma lista minha de campos: eu acrescentaria o campo ao
    // `shape.ts`, esqueceria daqui, e a suíte seguiria verde afirmando que "todo campo atravessa".
    assert.deepEqual(Object.keys(full('g')).sort(), Object.keys(plan.shape).sort(), 'acrescente o campo novo ao fixture acima, e confira `toPlan`/`values` no router')
  })

  it('`replaceAll` devolve o plano IDÊNTICO ao enviado', async () => {
    const u = await novoUsuario(d)
    created.push(u.userId)
    const context = { userId: u.userId }
    const r = plansRouter(d)

    const g = await call(r.addGroup, { label: 'Casa' }, { context })
    const sent = full(g.groups[0].id)
    const back = await call(r.replaceAll, { groups: g.groups, items: [sent] }, { context })

    // `deepEqual` e não campo a campo: é a única forma que pega o campo que eu não previ.
    assert.deepEqual(back.items[0], sent)
  })

  it('e `add` também — o outro caminho de escrita, com id gerado pelo servidor', async () => {
    // `add` e `replaceAll` chamam o mesmo `values`, mas por rotas diferentes: o primeiro insere, o
    // segundo apaga e reinsere. Um `onConflict` incompleto separa os dois.
    const u = await novoUsuario(d)
    created.push(u.userId)
    const context = { userId: u.userId }
    const r = plansRouter(d)

    const g = await call(r.addGroup, { label: 'Casa' }, { context })
    const { id: _generated, ...sent } = full(g.groups[0].id)
    const back = await call(r.add, sent, { context })

    const { id: _assigned, ...stored } = back.items[0]
    assert.deepEqual(stored, sent)
  })

  it('o que NÃO foi enviado volta ausente, e não como `null`', async () => {
    // O outro lado do mapeador: `values` escreve `null` em coluna sem valor, e `toPlan` precisa
    // desfazer isso. Um `null` que vaze para a resposta quebra o `?:` de todo consumidor — e o
    // contrato declara os campos como opcionais, não como anuláveis.
    const u = await novoUsuario(d)
    created.push(u.userId)
    const context = { userId: u.userId }
    const r = plansRouter(d)

    const back = await call(r.add, { label: 'Ideia solta', categoryId: 'outros', cash: 100, status: 'considering' }, { context })
    assert.deepEqual(Object.keys(back.items[0]).sort(), ['cash', 'categoryId', 'id', 'label', 'status'].sort(), 'campo sem valor não aparece na resposta')
  })
})

/**
 * O GRUPO de planos — o segundo agregado do mesmo router, e o que JÁ PERDEU campo.
 *
 * O bloco acima prova que todo campo do contrato de `plan` atravessa. O grupo tem o mesmo mapeador
 * à mão e nunca foi medido do mesmo jeito. A diferença é que aqui a perda não é hipótese: ela é o
 * estado atual, e está registrada em "Débitos em aberto".
 *
 * `PlanGroup` do domínio declara `from`, `to` e `note`; `group-dialog.tsx` coleta os três e o schema
 * da tela os valida. O contrato descreve `{ id, label }`, a tabela `plan_groups` tem duas colunas, e
 * o handler insere duas. Medido contra este mesmo Postgres em 15/09/2026: enviado
 * `{label, from, to, note}`, o servidor responde **200** e devolve `{id, label}`.
 *
 * O 200 é o ponto. Não há erro, não há aviso, e a tela não tem como saber — a pessoa preenche a
 * janela da viagem, salva, e ela não está lá quando volta.
 *
 * Os dois testes abaixo prendem os dois lados: o que o contrato promete atravessa de fato, e o que
 * o domínio tem a mais NÃO atravessa — este último com a lista exata. No dia em que as colunas
 * existirem, o segundo fica vermelho e obriga a tirar o item do caderno junto com o `DOES_NOT_CROSS`
 * de `wire-shape.test.ts`.
 */
describe('o grupo de planos atravessa o que o contrato declara', () => {
  it('o fixture do grupo cobre o contrato dele por inteiro', () => {
    assert.deepEqual(Object.keys({ id: 'g', label: 'Casa' }).sort(), Object.keys(planGroup.shape).sort())
  })

  it('e `replaceAll` devolve o grupo idêntico ao enviado', async () => {
    const u = await novoUsuario(d)
    created.push(u.userId)
    const context = { userId: u.userId }
    const r = plansRouter(d)

    const sent = { id: 'grupo-cheio', label: 'Arraial' }
    const back = await call(r.replaceAll, { groups: [sent], items: [] }, { context })
    assert.deepEqual(back.groups[0], sent)
  })

  it('os campos que o DOMÍNIO tem a mais são descartados — sem erro, com 200', async () => {
    const u = await novoUsuario(d)
    created.push(u.userId)
    const context = { userId: u.userId }
    const r = plansRouter(d)

    // Enviados como o `group-dialog.tsx` os coleta. O Zod do contrato os IGNORA em vez de recusar,
    // e é isso que torna a perda invisível: uma recusa apareceria na tela.
    const comJanela = { label: 'Arraial', from: '2026-01', to: '2026-06', note: 'a janela da viagem' }
    const back = await call(r.addGroup, comJanela as never, { context })

    assert.deepEqual(Object.keys(back.groups[0]).sort(), ['id', 'label'])
    assert.deepEqual(
      ['from', 'to', 'note'].filter((field) => field in back.groups[0]),
      [],
      'os três somem: é o débito, medido, e não um teste de comportamento desejado',
    )
  })
})
