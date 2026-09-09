import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeConfigService } from '../../src/services/config/application/config.service.ts'
import { ConfigUnavailableError, InvalidConfigError } from '../../src/services/config/domain/errors/index.ts'
import { makeFakeConfigRepository, makeFakeSeed, seedConfig } from '../../src/services/config/test-support/fake-config-repository.ts'

function setup(saved = null as null | ReturnType<typeof seedConfig>) {
  const repository = makeFakeConfigRepository(saved)
  const service = makeConfigService({ repository, seed: makeFakeSeed(seedConfig()) })
  return { repository, service }
}

describe('serviço de configuração: semente', () => {
  it('parte da semente quando o banco está vazio', async () => {
    const { service } = setup()
    const config = await service.load()
    assert.equal(config.planned.length, 1)
    assert.equal(config.budget.monthlyLimit, 9000)
  })

  it('prefere o que está gravado à semente', async () => {
    const gravado = { ...seedConfig(), budget: { monthlyLimit: 4000, warnAt: 0.5, byCategory: [] } }
    const { service } = setup(gravado)
    assert.equal((await service.load()).budget.monthlyLimit, 4000)
  })

  it('sem gravado E sem semente, GRITA em vez de devolver vazio', async () => {
    // Config vazia faria o app projetar zero e parecer que a pessoa não tem conta nenhuma.
    const service = makeConfigService({ repository: makeFakeConfigRepository(), seed: makeFakeSeed(null) })
    await assert.rejects(() => service.load(), ConfigUnavailableError)
  })

  it('reset volta ao que a semente declara', async () => {
    const { service } = setup({ ...seedConfig(), goals: [{ id: 'g', label: 'X', target: 1, saved: 0, slot: 1 }] as never })
    const back = await service.reset()
    assert.equal(back.goals.length, 0)
  })
})

describe('serviço de configuração: validação', () => {
  it('recusa regra parcelada sem número de parcelas', async () => {
    // Sem contagem a janela não tem fim, e a projeção iria ao infinito.
    const { service } = setup()
    await assert.rejects(
      () => service.savePlanned([{ id: 'x', kind: 'expense', label: 'Curso', amount: 100, categoryId: 'educacao', entity: 'PF', recurrence: 'installments', startMonth: '2026-01' }]),
      InvalidConfigError,
    )
  })

  it('recusa ids repetidos', async () => {
    const { service } = setup()
    const um = { id: 'x', kind: 'expense' as const, label: 'A', amount: 1, categoryId: 'moradia', entity: 'PF' as const, recurrence: 'monthly' as const, startMonth: '2026-01' }
    await assert.rejects(() => service.savePlanned([um, { ...um }]), InvalidConfigError)
  })

  it('recusa viagem que termina antes de começar', async () => {
    // Janela invertida produz custo zero sem nenhum aviso.
    const { service } = setup()
    await assert.rejects(() => service.saveTrips([{ id: 't', label: 'X', from: '2026-05-10', to: '2026-05-01' }]), InvalidConfigError)
  })

  it('recusa aviso de teto fora de 0..1', async () => {
    const { service } = setup()
    await assert.rejects(() => service.saveBudget({ monthlyLimit: 1000, warnAt: 75, byCategory: [] }), InvalidConfigError)
  })

  it('grava o agregado inteiro, não só a parte alterada', async () => {
    const { repository, service } = setup()
    await service.saveGoals([])
    const snap = repository.snapshot()
    assert.ok(snap)
    assert.equal(snap.planned.length, 1, 'o resto da config veio junto')
  })
})
