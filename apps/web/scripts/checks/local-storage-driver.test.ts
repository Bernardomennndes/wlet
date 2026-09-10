import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { EnvelopeSpec } from '@wlet/services/shared/envelope'
import { makeLocalStorageDriver, volatileStorage } from '@wlet/services/shared/infrastructure/local-storage.driver'

const spec: EnvelopeSpec<{ n: number }> = {
  version: 1,
  empty: () => ({ n: 0 }),
  parse: (raw) => (raw && typeof raw === 'object' && typeof (raw as { n?: unknown }).n === 'number' ? (raw as { n: number }) : null),
}

describe('driver de localStorage', () => {
  it('lê o que gravou', async () => {
    const driver = makeLocalStorageDriver(volatileStorage(), 'coisa', spec)
    await driver.write({ n: 7 })
    assert.deepEqual(await driver.read(), { n: 7 })
  })

  it('MIGRA a chave do prefixo antigo, e não a apaga', async () => {
    // Sem isto, quem não abriu o app desde a renomeação teria `wallet.coisa` gravado e o app
    // leria `wlet.coisa`, que não existe: tela vazia, sem erro nenhum.
    const storage = volatileStorage()
    storage.setItem('wallet.coisa', JSON.stringify({ version: 1, data: { n: 42 } }))
    const driver = makeLocalStorageDriver(storage, 'coisa', spec)
    assert.deepEqual(await driver.read(), { n: 42 })
    assert.ok(storage.getItem('wlet.coisa'), 'copiou para a chave nova')
    assert.ok(storage.getItem('wallet.coisa'), 'a antiga continua lá, para uma volta de versão não perder dado')
  })

  it('a chave nova ganha da antiga', async () => {
    const storage = volatileStorage()
    storage.setItem('wallet.coisa', JSON.stringify({ version: 1, data: { n: 1 } }))
    storage.setItem('wlet.coisa', JSON.stringify({ version: 1, data: { n: 2 } }))
    assert.deepEqual(await makeLocalStorageDriver(storage, 'coisa', spec).read(), { n: 2 })
  })

  it('conteúdo inválido cai no padrão em vez de derrubar a tela', async () => {
    const storage = volatileStorage()
    storage.setItem('wlet.coisa', 'isto não é json')
    assert.deepEqual(await makeLocalStorageDriver(storage, 'coisa', spec).read(), { n: 0 })
  })

  it('armazenamento que EXPLODE vira erro de domínio, não DOMException', async () => {
    const cheio = {
      getItem: () => null,
      setItem: () => {
        const e = new Error('cheio')
        e.name = 'QuotaExceededError'
        throw e
      },
      removeItem: () => {},
    }
    await assert.rejects(() => makeLocalStorageDriver(cheio, 'coisa', spec).write({ n: 1 }), /espaço de armazenamento/)
  })
})
