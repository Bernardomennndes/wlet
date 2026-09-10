import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeDatasetService } from '../../src/services/dataset/application/dataset.service.ts'
import { IncompleteDatasetError, NoSourcesError } from '../../src/services/dataset/domain/errors/index.ts'
import {
  makeBrokenDatasetRepository,
  makeBrokenRunner,
  makeFakeDatasetRepository,
  makeFakeRunner,
  makeFakeSeed,
  makeFakeSourceStore,
  seedDataset,
} from '../../src/services/dataset/test-support/fake-dataset-repository.ts'

describe('serviço do conjunto ingerido', () => {
  it('sem nada gravado, abre pela semente', async () => {
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(),
      seed: makeFakeSeed(seedDataset()),
    })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('prefere o gravado', async () => {
    const gravado = { ...seedDataset(), goals: [{ id: 'g' }] as never }
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(gravado),
      seed: makeFakeSeed(seedDataset()),
    })
    const { data, origin } = await service.load()
    assert.equal(origin, 'indexeddb')
    assert.equal(data.goals.length, 1)
  })

  it('banco que EXPLODE não impede o app de abrir', async () => {
    // Banco corrompido, bloqueado por outra aba ou inacessível: a semente é um app inteiro
    // funcionando, e recusar-se a abrir seria pior do que abrir somente-leitura.
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeBrokenDatasetRepository(),
      seed: makeFakeSeed(seedDataset()),
    })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('conjunto meio gravado cai na semente em vez de publicar buraco', async () => {
    // "As chaves existem" não distingue íntegro de meio gravado — por isso a conferência é do
    // CONTEÚDO, e uma parte ausente derruba para a semente.
    const meio = { ...seedDataset(), transactions: undefined } as never
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(meio),
      seed: makeFakeSeed(seedDataset()),
    })
    assert.equal((await service.load()).origin, 'seed')
  })

  it('recusa substituir por um conjunto incompleto', async () => {
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(),
      seed: makeFakeSeed(seedDataset()),
    })
    const incompleto = { ...seedDataset(), meta: undefined } as never
    await assert.rejects(() => service.replace(incompleto), IncompleteDatasetError)
  })

  it('substitui e depois volta para a semente', async () => {
    const repository = makeFakeDatasetRepository()
    const service = makeDatasetService({ sources: makeFakeSourceStore(), repository, seed: makeFakeSeed(seedDataset()) })
    await service.replace({ ...seedDataset(), goals: [{ id: 'x' }] as never })
    assert.equal(repository.snapshot()?.goals.length, 1)
    await service.reset()
    assert.equal(repository.cleared, true)
    assert.equal(repository.snapshot(), null)
  })
})

describe('serviço do conjunto ingerido: ingestão', () => {
  const config = {
    accounts: [],
    selfNamePatterns: [],
    rules: [],
    planned: [],
    receivables: [],
    budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
    goals: [],
  }

  it('grava o conjunto produzido e devolve o relatório', async () => {
    const repository = makeFakeDatasetRepository()
    const service = makeDatasetService({ sources: makeFakeSourceStore(), runner: makeFakeRunner({}), repository, seed: makeFakeSeed(seedDataset()) })
    const { data, report } = await service.ingest([], config, '2026-01-01T00:00:00.000Z')
    assert.ok(data.meta)
    assert.equal(report.filesRead, 0)
    assert.ok(repository.snapshot(), 'gravou')
  })

  it('uma ingestão INCOMPLETA não substitui um conjunto íntegro', async () => {
    // É a mesma conferência do `replace`: publicar meio conjunto é pior que não publicar.
    const bom = seedDataset()
    const repository = makeFakeDatasetRepository(bom)
    const service = makeDatasetService({ sources: makeFakeSourceStore(), runner: makeFakeRunner({ meta: undefined as never }), repository, seed: makeFakeSeed(bom) })
    await assert.rejects(() => service.ingest([], config, '2026-01-01T00:00:00.000Z'), IncompleteDatasetError)
    assert.ok(repository.snapshot()?.meta, 'o conjunto anterior continua lá')
  })

  it('falha na leitura não apaga o que já estava gravado', async () => {
    const bom = seedDataset()
    const repository = makeFakeDatasetRepository(bom)
    const service = makeDatasetService({ sources: makeFakeSourceStore(), runner: makeBrokenRunner(), repository, seed: makeFakeSeed(bom) })
    await assert.rejects(() => service.ingest([], config, '2026-01-01T00:00:00.000Z'), /ileg/)
    assert.ok(repository.snapshot(), 'intacto')
  })
})

describe('serviço do conjunto ingerido: arquivos-fonte', () => {
  const config = {
    accounts: [],
    selfNamePatterns: [],
    rules: [],
    planned: [],
    receivables: [],
    budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] },
    goals: [],
  }
  const arquivo = (path: string) => ({ path, bytes: new Uint8Array([1, 2, 3]) })

  it('guarda os arquivos ANTES de executar', async () => {
    // A ordem não é preferência: o executor TRANSFERE os buffers para o worker, e depois disso
    // eles ficam destacados. Gravar depois gravaria vazio, sem erro nenhum.
    const sources = makeFakeSourceStore()
    let quandoRodou = -1
    const runner = {
      run: async () => {
        quandoRodou = sources.snapshot().length
        return makeFakeRunner({}).run()
      },
    }
    const service = makeDatasetService({ sources, runner, repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    await service.ingest([arquivo('docs/a.ofx')], config, '2026-01-01T00:00:00.000Z')
    assert.equal(quandoRodou, 1, 'o arquivo já estava guardado quando o executor rodou')
  })

  it('reprocessa o que está guardado, sem receber arquivo', async () => {
    const sources = makeFakeSourceStore([arquivo('docs/a.ofx'), arquivo('docs/b.csv')])
    const runner = makeFakeRunner({})
    const service = makeDatasetService({ sources, runner, repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    assert.equal(await service.storedSources(), 2)
    await service.reingest(config, '2026-01-01T00:00:00.000Z')
    assert.equal(runner.calls, 1)
  })

  it('sem arquivo guardado, INSTRUI em vez de dar erro de sistema', async () => {
    const service = makeDatasetService({ sources: makeFakeSourceStore(), runner: makeFakeRunner({}), repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    await assert.rejects(() => service.reingest(config, '2026-01-01T00:00:00.000Z'), NoSourcesError)
    await assert.rejects(() => service.reingest(config, '2026-01-01T00:00:00.000Z'), /Escolha a pasta/)
  })

  it('uma pasta nova SUBSTITUI a anterior, não soma', async () => {
    // Um extrato que a pessoa apagou não pode continuar produzindo lançamentos.
    const sources = makeFakeSourceStore([arquivo('docs/velho.ofx')])
    const service = makeDatasetService({ sources, runner: makeFakeRunner({}), repository: makeFakeDatasetRepository(), seed: makeFakeSeed(seedDataset()) })
    await service.ingest([arquivo('docs/novo.ofx')], config, '2026-01-01T00:00:00.000Z')
    assert.deepEqual(
      sources.snapshot().map((f) => f.path),
      ['docs/novo.ofx'],
    )
  })

  it('reset descarta o conjunto E os arquivos', async () => {
    const sources = makeFakeSourceStore([arquivo('docs/a.ofx')])
    const service = makeDatasetService({ sources, runner: makeFakeRunner({}), repository: makeFakeDatasetRepository(seedDataset()), seed: makeFakeSeed(seedDataset()) })
    await service.reset()
    assert.equal(sources.cleared, true)
    assert.equal(await service.storedSources(), 0)
  })
})
