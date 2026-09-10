import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { makeConfigService } from '../../src/services/config/application/config.service.ts'
import { InvalidConfigError } from '../../src/services/config/domain/errors/index.ts'
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

  it('sem gravado E sem semente, abre em BRANCO em vez de recusar', async () => {
    // A semente vem de `src/generated/`, que não é versionado: um clone novo simplesmente não
    // a tem, e isso é o estado inicial do app, não um erro de montagem. Enquanto ele gritava,
    // apagar aquela pasta derrubava o boot inteiro.
    const service = makeConfigService({ repository: makeFakeConfigRepository(), seed: makeFakeSeed(null) })
    const config = await service.load()
    assert.deepEqual(config.planned, [])
    assert.equal(config.budget.monthlyLimit, 0, 'teto zero é lido como "não há teto"')
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

describe('serviço de configuração: composição de rubrica', () => {
  const comItens = (items: { label: string; quantity: number; unitAmount: number }[]) => ({
    monthlyLimit: 5000,
    warnAt: 0.75,
    byCategory: [{ categoryId: 'suplementacao', amount: 0, items }],
  })

  it('grava o total DERIVADO da composição, não o que veio junto', async () => {
    // A leitura já ignora o `amount` quando há itens; normalizar na escrita é o que impede o
    // dado gravado — e o pacote exportado — de carregar um total que contradiz a lista.
    const { repository, service } = setup()
    await service.saveBudget(comItens([{ label: 'Whey', quantity: 2, unitAmount: 180 }]))
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].amount, 360)
  })

  it('ACEITA item incompleto, porque todo item nasce assim', async () => {
    // A tela grava a cada tecla. Recusar nome em branco fazia o gesto de apagar para renomear
    // acender um erro vermelho no meio da digitação, e recusar quantidade zero impedia a
    // própria adição de um item — foi o que me levou a inventar "Novo item" no lugar do nome
    // que a pessoa ainda não tinha escrito.
    const { repository, service } = setup()
    await service.saveBudget(comItens([{ label: '', quantity: 0, unitAmount: 0 }]))
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].items?.length, 1)
    assert.equal(repository.snapshot()?.budget.byCategory?.[0].amount, 0, 'incompleto vale zero, e zero não estraga soma nenhuma')
  })

  it('recusa o que é IMPOSSÍVEL: valor negativo', async () => {
    const { service } = setup()
    await assert.rejects(() => service.saveBudget(comItens([{ label: 'Whey', quantity: 1, unitAmount: -1 }])), InvalidConfigError)
    await assert.rejects(() => service.saveBudget(comItens([{ label: 'Whey', quantity: -1, unitAmount: 10 }])), InvalidConfigError)
  })
})
