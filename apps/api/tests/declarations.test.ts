import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { call } from '@orpc/server'
import { goals, plannedEntries, settings } from '@wlet/db'
import { configRouter } from '../src/routers/config'
import { ORCAMENTO_VAZIO, readDeclarations, readDeclarationsWire } from '../src/shared/declarations'
import { db, limpar, novoUsuario } from './support'

/**
 * A leitura da configuração — e a DEFESA que protege as linhas que já estão gravadas.
 *
 * O `budget` é `notNull`, então a linha de `settings` que nasce por causa de uma preferência
 * precisa pôr alguma coisa ali. Ela punha `{}`, e `{}` não é nullish: o `??` não disparava, o
 * `GET /config` devolvia um orçamento sem `monthlyLimit` nem `warnAt`, e a validação de saída
 * recusava a RESPOSTA INTEIRA. A pessoa perdia a configuração toda por causa de um orçamento que
 * nunca abriu.
 *
 * Hoje há DUAS defesas, e só uma delas cobre o passado: a escrita passou a gravar o vazio
 * declarado, o que conserta as linhas NOVAS; e a leitura confere o orçamento pelo CONTEÚDO, o que
 * é o que salva as linhas que já nasceram com `{}`. Por isso este arquivo escreve `{}` direto na
 * tabela — não é fixture artificial, é o estado em que essas linhas estão.
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

/** Uma linha de `settings` como ela está no banco, sem passar por router nenhum. */
const gravarSettings = (userId: string, budget: unknown, extra: Record<string, unknown> = {}) =>
  d
    .insert(settings)
    .values({ userId, preferences: { scope: null, period: null, theme: null }, budget, accountProfiles: [], rules: [], selfNamePatterns: [], ...extra } as never)
    .onConflictDoUpdate({ target: settings.userId, set: { budget, ...extra } as never })

describe('o orçamento que não é um orçamento', () => {
  it('uma linha com `{}` não derruba a configuração INTEIRA', async () => {
    // O incidente, reproduzido pelo caminho real: a resposta é validada na saída, então um
    // orçamento sem os dois campos não devolve "orçamento vazio" — ele rejeita o `GET` todo, e
    // com ele as regras, os previstos, as cobranças e as metas que nada têm a ver com isso.
    const { context, userId } = await comUsuario()
    await gravarSettings(userId, {})
    const config = await call(configRouter(d).get, undefined, { context })
    assert.deepEqual(config.budget, ORCAMENTO_VAZIO)
  })

  it('e um orçamento PELA METADE também recua para o vazio', async () => {
    // `monthlyLimit` sem `warnAt` é o mesmo problema com outra cara: atravessaria a guarda de um
    // `??` e seria recusado pela validação de saída do mesmo jeito. A conferência é dos DOIS
    // campos porque é dos dois que o contrato depende.
    const { context, userId } = await comUsuario()
    await gravarSettings(userId, { monthlyLimit: 1000 })
    assert.deepEqual((await call(configRouter(d).get, undefined, { context })).budget, ORCAMENTO_VAZIO)
  })

  it('mas o orçamento de VERDADE atravessa inteiro', async () => {
    // A defesa não pode ser um apagador: recuar para o vazio um orçamento válido seria perder a
    // configuração de um jeito mais silencioso do que o defeito original.
    const { context, userId } = await comUsuario()
    const orcamento = { monthlyLimit: 5000, warnAt: 0.8, byCategory: [{ categoryId: 'mercado', amount: 900 }] }
    await gravarSettings(userId, orcamento)
    assert.deepEqual((await call(configRouter(d).get, undefined, { context })).budget, orcamento)
  })

  it('e quem nunca gravou linha nenhuma recebe o vazio declarado', async () => {
    const { context } = await comUsuario()
    assert.deepEqual((await call(configRouter(d).get, undefined, { context })).budget, ORCAMENTO_VAZIO)
  })
})

describe('o `externalId` de uma conta aceita as DUAS formas', () => {
  const perfil = (externalId: unknown) => [
    { id: 'nu-pf', name: 'Conta PF', bank: 'Nubank', bankCode: '260', type: 'checking', entity: 'PF', holder: 'Titular', match: { bankCode: '260', externalId } },
  ]

  it('texto continua texto — não vira expressão', async () => {
    // O campo é `string | RegExp`, e só a segunda forma precisa de travessia. Mandar uma string
    // para `fromRegexWire` lê `source` de um lugar que não tem, e o perfil volta como
    // `/undefined/` — um casamento que aceita QUALQUER conta, silenciosamente.
    const { context, userId } = await comUsuario()
    await gravarSettings(userId, ORCAMENTO_VAZIO, { accountProfiles: perfil('1234567') })
    const [conta] = (await call(configRouter(d).get, undefined, { context })).accounts
    assert.equal(conta.match.externalId, '1234567')

    const dominio = await readDeclarations(d, userId)
    assert.equal(dominio.accounts[0].match.externalId, '1234567', 'no domínio também é texto')
  })

  it('expressão volta a ser expressão do lado do PIPELINE, e forma de fio do lado da tela', async () => {
    // É a razão de haver duas funções de leitura: o pipeline espera o tipo do domínio, a tela
    // espera o que atravessa JSON. Converter na fronteira, uma vez, é o que impede o `{}`
    // silencioso do outro lado — `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum.
    const { context, userId } = await comUsuario()
    await gravarSettings(userId, ORCAMENTO_VAZIO, { accountProfiles: perfil({ source: '^0*123$', flags: 'i' }) })

    const dominio = await readDeclarations(d, userId)
    assert.ok(dominio.accounts[0].match.externalId instanceof RegExp)
    assert.equal((dominio.accounts[0].match.externalId as RegExp).flags, 'i', 'as flags atravessam junto')

    const { accounts } = await call(configRouter(d).get, undefined, { context })
    assert.deepEqual(accounts[0].match.externalId, { source: '^0*123$', flags: 'i' })
  })

  it('campo ausente segue AUSENTE, e não vira `undefined` escrito', async () => {
    // O `match` é montado campo a campo de propósito. Uma chave presente com `undefined` muda o
    // que `'externalId' in match` responde, e é essa pergunta que decide se a conta casa por id.
    const { context, userId } = await comUsuario()
    await gravarSettings(userId, ORCAMENTO_VAZIO, { accountProfiles: perfil(undefined) })
    const [conta] = (await call(configRouter(d).get, undefined, { context })).accounts
    assert.equal('externalId' in conta.match, false)
  })
})

describe('as duas leituras não podem divergir', () => {
  it('a do fio é a do domínio, e só os campos que JSON não sabe escrever mudam', async () => {
    // Dois consumidores: o `GET /config`, que devolve para a tela, e o pipeline, que recebe para
    // categorizar e casar. Se o segundo remontasse a própria versão, uma regra nova passaria a
    // valer numa e não na outra — e o sintoma seria a tela mostrar uma categorização que o
    // ingest não reproduz.
    const { userId } = await comUsuario()
    await gravarSettings(
      userId,
      { monthlyLimit: 300, warnAt: 0.5, byCategory: [] },
      { rules: [{ id: 'r1', test: { source: 'IFOOD', flags: 'i' }, category: 'restaurantes' }], selfNamePatterns: [{ source: 'MEU NOME', flags: 'i' }] },
    )
    // As listas precisam ter CONTEÚDO, e isto é o conserto de um teste que passava pelo motivo
    // errado: sem previsto e sem meta, esvaziar as duas na leitura do fio não mudava nada, e a
    // mutação que remonta a resposta sozinha passava despercebida. Comparar vazio com vazio
    // sempre fecha.
    await d
      .insert(plannedEntries)
      .values({ userId, id: 'p1', kind: 'expense', label: 'Aluguel', amount: '1500.00', categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01' } as never)
    await d.insert(goals).values({ userId, id: 'g1', label: 'Reserva', target: '20000.00', saved: '5000.00', slot: '3', targetMonth: '2027-12' } as never)

    const dominio = await readDeclarations(d, userId)
    const fio = await readDeclarationsWire(d, userId)

    assert.deepEqual(fio.budget, dominio.budget)
    assert.deepEqual(fio.planned, dominio.planned)
    assert.deepEqual(fio.receivables, dominio.receivables)
    assert.deepEqual(fio.goals, dominio.goals)
    assert.equal(dominio.planned.length, 1, 'há o que comparar')
    assert.equal(dominio.planned[0].amount, 1500, 'o `numeric` volta como número nas duas')
    assert.equal(dominio.goals[0].slot, 3)

    assert.ok(dominio.rules[0].test instanceof RegExp, 'o pipeline recebe a expressão')
    assert.deepEqual(fio.rules[0].test, { source: 'IFOOD', flags: 'i' }, 'a tela recebe a forma do fio')
    assert.deepEqual(fio.selfNamePatterns, [{ source: 'MEU NOME', flags: 'i' }])
    assert.ok(dominio.selfNamePatterns[0] instanceof RegExp)
  })

  it('e o dado de uma pessoa não vaza na leitura direta', async () => {
    // `readDeclarations` é chamada fora do router — pelo pipeline —, então o recorte por usuário
    // precisa estar NELA e não só no handler que a chama.
    const a = await comUsuario()
    const b = await comUsuario()
    await gravarSettings(a.userId, { monthlyLimit: 777, warnAt: 0.9, byCategory: [] })
    assert.equal((await readDeclarations(d, b.userId)).budget.monthlyLimit, 0, 'o orçamento de A não aparece para B')
  })
})
