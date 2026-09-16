import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decode, encode, fromJson, toJson } from '@wlet/lib/portable'

/**
 * A ida e volta do arquivo exportado. O caso que motiva o módulo é a expressão regular:
 * `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum, e um export ingênuo produziria um
 * arquivo que importa "com sucesso" e deixa a categorização sem regra alguma.
 */
describe('serialização portável', () => {
  it('preserva RegExp com origem e flags', () => {
    const back = decode(encode({ test: /MERCADO\s+DO\s+SEU/iu })) as { test: RegExp }
    assert.ok(back.test instanceof RegExp)
    assert.equal(back.test.source, 'MERCADO\\s+DO\\s+SEU')
    assert.equal(back.test.flags, 'iu')
  })

  it('mostra o que se perderia sem o módulo', () => {
    // A prova do problema: pelo caminho comum, a regra some e nada avisa.
    assert.deepEqual(JSON.parse(JSON.stringify({ test: /X/i })), { test: {} })
  })

  it('preserva a forma real de uma regra de categoria', () => {
    const rules = [
      { id: 'mercado', test: /MERCADO |SUPERMERCADO/, category: 'mercado' },
      { id: 'ifood', test: /^IFD\*/i, category: 'restaurantes' },
    ]
    const back = decode(encode(rules)) as typeof rules
    assert.equal(back.length, 2)
    assert.ok(back[0].test.test('MERCADO CENTRAL'))
    assert.ok(back[1].test.test('ifd*algo'))
    assert.equal(back[0].category, 'mercado')
  })

  it('preserva Date, e o resto intacto', () => {
    const when = new Date('2026-09-08T12:00:00.000Z')
    const back = decode(encode({ when, n: 12.5, s: 'ação', b: false, nul: null, arr: [1, [2, { deep: /a/g }]] })) as Record<string, unknown>
    assert.ok((back.when as Date) instanceof Date)
    assert.equal((back.when as Date).toISOString(), when.toISOString())
    assert.equal(back.n, 12.5)
    assert.equal(back.s, 'ação')
    assert.equal(back.b, false)
    assert.equal(back.nul, null)
    // A expressão ANINHADA também leva origem e flags: `instanceof` sozinho passa com uma vazia, e
    // `//` casa qualquer texto — o mesmo desfecho que a regra de categoria perdida.
    const deep = (((back.arr as unknown[])[1] as unknown[])[1] as { deep: RegExp }).deep
    assert.ok(deep instanceof RegExp)
    assert.equal(deep.source, 'a')
    assert.equal(deep.flags, 'g')
  })

  it('faz a volta completa por texto', () => {
    const payload = { rules: [{ test: /A|B/gi }], plans: { version: 2, items: [] } }
    const back = fromJson(toJson(payload)) as typeof payload
    assert.equal(back.rules[0].test.source, 'A|B')
    assert.equal(back.rules[0].test.flags, 'gi')
    assert.equal(back.plans.version, 2)
  })

  it('recusa arquivo de outro app em vez de importar vazio', () => {
    // Importar "com sucesso" um arquivo alheio apagaria o estado atual sem avisar.
    assert.equal(fromJson('{"app":"outro","version":1,"payload":{}}'), null)
    assert.equal(fromJson('{"app":"wlet","version":99,"payload":{}}'), null)
    assert.equal(fromJson('não é json'), null)
    assert.equal(fromJson('{"app":"wlet","version":1}'), null)
  })

  it('descarta regra torta sem derrubar a importação', () => {
    const back = decode({ ok: { $re: 'A', $flags: '' }, torta: { $re: '[', $flags: '' } }) as Record<string, unknown>
    assert.ok(back.ok instanceof RegExp)
    assert.equal(back.torta, undefined)
  })
})
