import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeDatasetService } from '../../src/services/dataset/application/dataset.service.ts'
import { IncompleteDatasetError } from '../../src/services/dataset/domain/errors/index.ts'
import { makeBrokenDatasetRepository, makeFakeDatasetRepository, makeFakeSeed, seedDataset } from '../../src/services/dataset/test-support/fake-dataset-repository.ts'

describe('serviço do conjunto ingerido', () => {
  it('sem nada gravado, abre pela semente', async () => {
    const service = makeDatasetService({ repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('prefere o gravado', async () => {
    const gravado = { ...seedDataset(), goals: [{ id: 'g' }] as never }
    const service = makeDatasetService({ repository: makeFakeDatasetRepository(gravado), seed: makeFakeSeed(seedDataset()) })
    const { data, origin } = await service.load()
    assert.equal(origin, 'indexeddb')
    assert.equal(data.goals.length, 1)
  })

  it('banco que EXPLODE não impede o app de abrir', async () => {
    // Banco corrompido, bloqueado por outra aba ou inacessível: a semente é um app inteiro
    // funcionando, e recusar-se a abrir seria pior do que abrir somente-leitura.
    const service = makeDatasetService({ repository: makeBrokenDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('conjunto meio gravado cai na semente em vez de publicar buraco', async () => {
    // "As chaves existem" não distingue íntegro de meio gravado — por isso a conferência é do
    // CONTEÚDO, e uma parte ausente derruba para a semente.
    const meio = { ...seedDataset(), transactions: undefined } as never
    const service = makeDatasetService({ repository: makeFakeDatasetRepository(meio), seed: makeFakeSeed(seedDataset()) })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('recusa substituir por um conjunto incompleto', async () => {
    const service = makeDatasetService({ repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    const incompleto = { ...seedDataset(), meta: undefined } as never
    await assert.rejects(() => service.replace(incompleto), IncompleteDatasetError)
  })

  it('substitui e depois volta para a semente', async () => {
    const repository = makeFakeDatasetRepository()
    const service = makeDatasetService({ repository, seed: makeFakeSeed(seedDataset()) })
    await service.replace({ ...seedDataset(), goals: [{ id: 'x' }] as never })
    assert.equal(repository.snapshot()?.goals.length, 1)
    await service.reset()
    assert.equal(repository.cleared, true)
    assert.equal(repository.snapshot(), null)
  })
})
