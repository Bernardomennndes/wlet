import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeOverridesService } from '../../src/services/overrides/application/overrides.service.ts'
import { UnknownCategoryError } from '../../src/services/overrides/domain/errors/index.ts'
import { makeFakeOverrideRepository } from '../../src/services/overrides/test-support/fake-override-repository.ts'

const setup = (inicial = {}) => {
  const repository = makeFakeOverrideRepository(inicial)
  return { repository, service: makeOverridesService({ repository, categoryExists: (id) => ['mercado', 'moradia'].includes(id) }) }
}

describe('serviço de ajustes manuais de categoria', () => {
  it('grava um ajuste', async () => {
    const { service } = setup()
    assert.deepEqual(await service.set('tx1', 'mercado'), { tx1: 'mercado' })
  })

  it('null REMOVE o ajuste em vez de gravar nulo', async () => {
    // Ajuste que aponta para lugar nenhum não é estado: é a ausência de ajuste. Gravá-lo faria
    // a contagem mentir.
    const { repository, service } = setup({ tx1: 'mercado', tx2: 'moradia' })
    await service.set('tx1', null)
    assert.deepEqual(repository.snapshot(), { tx2: 'moradia' })
    assert.equal(await service.count(), 1)
  })

  it('recusa categoria fora do catálogo', async () => {
    const { repository, service } = setup()
    await assert.rejects(() => service.set('tx1', 'inexistente'), UnknownCategoryError)
    assert.deepEqual(repository.snapshot(), {}, 'nada foi gravado')
  })

  it('limpar apaga todos', async () => {
    const { service } = setup({ a: 'mercado', b: 'moradia' })
    assert.deepEqual(await service.clear(), {})
    assert.equal(await service.count(), 0)
  })
})
