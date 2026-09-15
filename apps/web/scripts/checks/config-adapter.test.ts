import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeOrpcConfigRepository } from '@wlet/services'
import { DomainError } from '@wlet/services/shared/domain/errors'

/**
 * A travessia de `RegExp` do lado do CLIENTE — o espelho da que já falhou do lado do servidor.
 *
 * `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum. É a razão de a configuração nunca ter
 * cabido em `localStorage`, e é o que torna esta conversão perigosa: um lado que a esqueça entrega
 * uma regra VAZIA, e regra vazia não estoura — ela simplesmente não casa nada, todo gasto cai em
 * "Outros", e a tela fica plausível.
 *
 * Duas travessias acontecem aqui: as regras de categoria e o `externalId` do perfil de conta. O
 * `externalId` é o pior dos dois, porque aceita `RegExp` OU string: converter a string errada
 * produz `/undefined/`, que casa qualquer conta — o extrato de uma entra no perfil de outra.
 */
const WIRE = {
  accounts: [
    { id: 'nu-pf', name: 'Nubank', bank: 'Nubank', bankCode: '260', type: 'checking', entity: 'PF', holder: 'T', match: { bankCode: '260', externalId: { source: '^0*123$', flags: 'i' } } },
    { id: 'inter', name: 'Inter', bank: 'Inter', bankCode: '077', type: 'checking', entity: 'PJ', holder: 'T', match: { externalId: '9988776' } },
    { id: 'xp', name: 'XP', bank: 'XP', bankCode: '348', type: 'credit-card', entity: 'PF', holder: 'T', match: { pathIncludes: 'xp' } },
  ],
  selfNamePatterns: [{ source: 'MEU NOME', flags: 'i' }],
  rules: [{ id: 'r1', test: { source: 'IFOOD|RAPPI', flags: 'i' }, category: 'restaurantes' }],
  planned: [],
  receivables: [],
  goals: [],
  budget: { monthlyLimit: 1000, warnAt: 0.75, byCategory: [] },
}

function fakeClient(over: { get?: () => Promise<unknown>; replace?: (input: unknown) => Promise<unknown> } = {}) {
  const sent: unknown[] = []
  const client = {
    config: {
      get: over.get ?? (async () => structuredClone(WIRE)),
      replace:
        over.replace ??
        (async (input: unknown) => {
          sent.push(input)
          return input
        }),
    },
  }
  return { client: client as never, sent }
}

describe('o que chega do servidor vira DOMÍNIO', () => {
  it('as regras de categoria voltam a ser `RegExp`, com as flags', () => {
    // Sem a conversão, `r.test.test(...)` estoura — `{source, flags}` não tem `.test`. Com ela
    // errada (flags perdidas), a regra deixa de casar minúsculas e metade do extrato muda de
    // categoria sem nada avisar.
    return makeOrpcConfigRepository({ client: fakeClient().client })
      .find()
      .then((config) => {
        assert.ok(config.rules[0].test instanceof RegExp)
        assert.equal(config.rules[0].test.source, 'IFOOD|RAPPI')
        assert.equal(config.rules[0].test.flags, 'i')
        assert.ok(config.selfNamePatterns[0] instanceof RegExp)
      })
  })

  it('o `externalId` em EXPRESSÃO vira expressão, e em TEXTO continua texto', async () => {
    // O campo aceita os dois. Mandar a string para `fromRegexWire` lê `source` de onde não há, e
    // o perfil volta como `/undefined/` — um casamento que aceita QUALQUER conta, em silêncio.
    const config = await makeOrpcConfigRepository({ client: fakeClient().client }).find()
    assert.ok(config.accounts[0].match.externalId instanceof RegExp)
    assert.equal(config.accounts[1].match.externalId, '9988776')
  })

  it('campo ausente segue AUSENTE, e não vira chave com `undefined`', async () => {
    // O `match` é montado campo a campo de propósito. Uma chave presente valendo `undefined` muda
    // o que `'externalId' in match` responde — e é essa pergunta que decide se a conta casa por id.
    const config = await makeOrpcConfigRepository({ client: fakeClient().client }).find()
    assert.equal('externalId' in config.accounts[2].match, false)
    assert.equal('bankCode' in config.accounts[1].match, false)
  })
})

describe('o que vai para o servidor volta a ser FIO', () => {
  it('a expressão é desmontada em `source` e `flags`', async () => {
    const { client, sent } = fakeClient()
    const repository = makeOrpcConfigRepository({ client })
    await repository.save(await repository.find())
    const payload = sent[0] as typeof WIRE
    assert.deepEqual(payload.rules[0].test, { source: 'IFOOD|RAPPI', flags: 'i' })
    assert.deepEqual(payload.selfNamePatterns, [{ source: 'MEU NOME', flags: 'i' }])
  })

  it('e a IDA E VOLTA não perde nada', async () => {
    // A propriedade que fecha as duas conversões de uma vez: o que o servidor mandou, depois de
    // virar domínio e voltar a virar fio, tem de ser idêntico. Uma das duas pontas esquecida
    // aparece aqui como diferença, mesmo que cada uma sozinha pareça certa.
    const { client, sent } = fakeClient()
    const repository = makeOrpcConfigRepository({ client })
    await repository.save(await repository.find())
    assert.deepEqual(sent[0], WIRE)
  })
})

describe('o erro do servidor chega traduzido', () => {
  it('uma falha na leitura vira erro de DOMÍNIO, não `ORPCError` cru', async () => {
    // É o que `remote()` existe para fazer. Sem ele, a tela mostra "Failed to fetch" — uma frase
    // que não diz nem que houve rede envolvida.
    const { client } = fakeClient({
      get: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await assert.rejects(
      () => makeOrpcConfigRepository({ client }).find(),
      (error: unknown) => error instanceof DomainError,
    )
  })

  it('e uma falha na ESCRITA também', async () => {
    const { client } = fakeClient({
      replace: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await assert.rejects(
      () => makeOrpcConfigRepository({ client }).save({ ...WIRE, rules: [], selfNamePatterns: [], accounts: [] } as never),
      (error: unknown) => error instanceof DomainError,
    )
  })
})
