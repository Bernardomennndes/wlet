import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeDatasetService } from '@wlet/services/dataset/application/dataset.service'
import { IncompleteDatasetError, NoSourcesError } from '@wlet/services/dataset/domain/errors/index'
import type { IngestRunner } from '@wlet/services/dataset/domain/ports/ingest-runner'
import {
  makeBrokenDatasetRepository,
  makeBrokenRunner,
  makeFakeDatasetRepository,
  makeFakeRunner,
  makeFakeSeed,
  makeFakeSourceStore,
  seedDataset,
} from '@wlet/services/dataset/test-support/fake-dataset-repository'

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
    // O marcador é `transactions`, e antes era `goals` — um campo que saiu de `Dataset` para a
    // configuração. Com um `as never` no meio, o teste afirmava sobre um fantasma: passava porque o
    // spread carrega a propriedade extra em runtime, e nada checava que ela existia no tipo.
    const gravado = { ...seedDataset(), transactions: [{ id: 'tx-gravada' }] as never }
    const service = makeDatasetService({
      sources: makeFakeSourceStore(),
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(gravado),
      seed: makeFakeSeed(seedDataset()),
    })
    const { data, origin } = await service.load()
    assert.equal(origin, 'stored')
    assert.equal(data.transactions.length, 1)
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
    const service = makeDatasetService({ sources: makeFakeSourceStore(), runner: makeFakeRunner({}), repository, seed: makeFakeSeed(seedDataset()) })
    await service.replace({ ...seedDataset(), transactions: [{ id: 'tx-substituida' }] as never })
    assert.equal(repository.snapshot()?.transactions.length, 1)
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
    const runner: IngestRunner = {
      run: async (arquivos, declaracoes, agora) => {
        quandoRodou = sources.snapshot().length
        // Os três argumentos são ENCAMINHADOS, e não descartados: a porta os declara, e um fake que
        // os ignore deixa de exercitar a assinatura que o serviço de fato chama.
        return makeFakeRunner({}).run(arquivos, declaracoes, agora)
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

  it('e o que o reset DEVOLVE, quando não há semente, é o vazio', async () => {
    // "Sem semente no build, voltar ao início é voltar ao VAZIO — que é literalmente o estado de
    // origem deste app." O caso é o clone novo que nunca rodou `pnpm ingest`: não há
    // `src/generated/`, então a semente devolve `null`.
    //
    // O teste ao lado prende que o reset LIMPA; este prende o que ele devolve. Sem o
    // `?? emptyDataset()`, o `null` chegaria à tela como conjunto — e a tela lê `meta.months`, que
    // num `null` estoura. A pessoa apertaria "recomeçar" e o app quebraria, no exato momento em que
    // ela quer voltar ao início.
    const sources = makeFakeSourceStore([arquivo('docs/a.ofx')])
    const service = makeDatasetService({
      sources,
      runner: makeFakeRunner({}),
      repository: makeFakeDatasetRepository(seedDataset()),
      seed: { read: async () => null },
    })

    const fresh = await service.reset()
    assert.deepEqual(fresh.transactions, [])
    assert.deepEqual(fresh.accounts, [])
    assert.deepEqual(fresh.meta.months, [], 'e `meta` existe, com meses vazios — é isso que a tela lê')
    assert.equal(sources.cleared, true, 'os arquivos somem igual')
  })

  it('reset descarta o conjunto E os arquivos', async () => {
    const sources = makeFakeSourceStore([arquivo('docs/a.ofx')])
    const service = makeDatasetService({ sources, runner: makeFakeRunner({}), repository: makeFakeDatasetRepository(seedDataset()), seed: makeFakeSeed(seedDataset()) })
    await service.reset()
    assert.equal(sources.cleared, true)
    assert.equal(await service.storedSources(), 0)
  })
})
