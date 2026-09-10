import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeLocalStorageOverrideRepository } from '@wlet/services/overrides/infrastructure/local-storage-override.adapter'
import { makeLocalStoragePreferencesRepository } from '@wlet/services/preferences/infrastructure/local-storage-preferences.adapter'
import { volatileStorage } from '@wlet/services/shared/infrastructure/local-storage.driver'

/**
 * As migrações de formato, que são o modo de falha mais caro desta camada inteira.
 *
 * Nenhuma delas dá erro quando quebra: chave ausente é indistinguível de "nunca escolheu", e
 * envelope com versão inesperada cai no padrão. O usuário só descobre abrindo o app e vendo os
 * ajustes de meses sumidos. Por isso cada caminho antigo tem teste.
 */
describe('migração dos ajustes manuais', () => {
  it('lê o formato CRU antigo, sem envelope', async () => {
    const storage = volatileStorage()
    storage.setItem('wlet.overrides', JSON.stringify({ tx1: 'mercado' }))
    assert.deepEqual(await makeLocalStorageOverrideRepository(storage).findAll(), { tx1: 'mercado' })
  })

  it('lê o formato cru sob o prefixo ANTIGO da marca', async () => {
    const storage = volatileStorage()
    storage.setItem('wallet.overrides', JSON.stringify({ tx2: 'moradia' }))
    assert.deepEqual(await makeLocalStorageOverrideRepository(storage).findAll(), { tx2: 'moradia' })
  })

  it('depois de gravar, passa a ler o formato novo', async () => {
    const storage = volatileStorage()
    storage.setItem('wlet.overrides', JSON.stringify({ tx1: 'mercado' }))
    const repo = makeLocalStorageOverrideRepository(storage)
    await repo.save({ tx1: 'mercado', tx3: 'moradia' })
    assert.deepEqual(await repo.findAll(), { tx1: 'mercado', tx3: 'moradia' })
  })
})

describe('migração das preferências', () => {
  it('junta as TRÊS chaves antigas num agregado só', async () => {
    // Ler só a chave nova abriria o app de quem já usa no recorte errado, no período errado e
    // com o tema piscando para o do sistema — e nada disso daria erro.
    const storage = volatileStorage()
    storage.setItem('wlet.scope', JSON.stringify('PJ'))
    storage.setItem('wlet.period', JSON.stringify({ from: '2026-01', to: '2026-06' }))
    storage.setItem('wlet.theme', JSON.stringify('dark'))
    assert.deepEqual(await makeLocalStoragePreferencesRepository(storage).find(), { scope: 'PJ', period: { from: '2026-01', to: '2026-06' }, theme: 'dark' })
  })

  it('lê as chaves antigas sob o prefixo ANTIGO da marca', async () => {
    const storage = volatileStorage()
    storage.setItem('wallet.scope', JSON.stringify('PF'))
    storage.setItem('wallet.theme', JSON.stringify('light'))
    const p = await makeLocalStoragePreferencesRepository(storage).find()
    assert.equal(p.scope, 'PF')
    assert.equal(p.theme, 'light')
  })

  it('o envelope novo ganha das chaves antigas', async () => {
    const storage = volatileStorage()
    storage.setItem('wlet.scope', JSON.stringify('PJ'))
    const repo = makeLocalStoragePreferencesRepository(storage)
    await repo.save({ scope: 'PF', period: null, theme: null })
    assert.equal((await repo.find()).scope, 'PF')
  })

  it('valor antigo corrompido não vira preferência inventada', async () => {
    const storage = volatileStorage()
    storage.setItem('wlet.scope', JSON.stringify('MARTE'))
    storage.setItem('wlet.period', JSON.stringify({ from: '2026-06', to: '2026-01' }))
    assert.deepEqual(await makeLocalStoragePreferencesRepository(storage).find(), { scope: null, period: null, theme: null })
  })
})
