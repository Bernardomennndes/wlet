import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPlans } from '../../src/lib/plans.ts'
import { exportState, importState } from '../../src/services/backup.ts'
import { makeConfigService } from '../../src/services/config/application/config.service.ts'
import { makeFakeConfigRepository, makeFakeSeed as makeFakeConfigSeed, seedConfig } from '../../src/services/config/test-support/fake-config-repository.ts'
import { makeOverridesService } from '../../src/services/overrides/application/overrides.service.ts'
import { makeFakeOverrideRepository } from '../../src/services/overrides/test-support/fake-override-repository.ts'
import { makePlansService } from '../../src/services/plans/application/plans.service.ts'
import { makeFakePlanRepository, makeSequentialIds } from '../../src/services/plans/test-support/fake-plan-repository.ts'
import { makePreferencesService } from '../../src/services/preferences/application/preferences.service.ts'
import { makeFakePreferencesRepository } from '../../src/services/preferences/test-support/fake-preferences-repository.ts'
import type { Services } from '../../src/services/index.ts'

/**
 * A ida e volta da cópia de segurança.
 *
 * Ela existe porque, com o dado morando no navegador, o export é a única defesa contra o
 * despejo do armazenamento — e uma cópia que não volta é pior que nenhuma, porque dá a
 * impressão de que existe. O `dataset` fica de fora dos serviços montados aqui: o backup não
 * o toca, e é isso que este teste também afirma.
 */
function setup(): Services & { snapshots: () => unknown } {
  const configRepo = makeFakeConfigRepository()
  const planRepo = makeFakePlanRepository()
  const overrideRepo = makeFakeOverrideRepository()
  const prefRepo = makeFakePreferencesRepository()
  return {
    dataset: null as never,
    config: makeConfigService({ repository: configRepo, seed: makeFakeConfigSeed(seedConfig()) }),
    plans: makePlansService({ repository: planRepo, ids: makeSequentialIds() }),
    overrides: makeOverridesService({ repository: overrideRepo, categoryExists: () => true }),
    preferences: makePreferencesService({ repository: prefRepo, floorMonth: () => '2026-01' }),
    snapshots: () => ({ config: configRepo.snapshot(), plans: planRepo.snapshot(), overrides: overrideRepo.snapshot(), prefs: prefRepo.snapshot() }),
  }
}

describe('cópia de segurança', () => {
  it('exporta e importa de volta o que a pessoa digitou', async () => {
    const origem = setup()
    await origem.plans.addPlan({ label: 'Monitor', categoryId: 'tecnologia', cash: 3000 })
    await origem.overrides.set('tx1', 'mercado')
    await origem.preferences.setScope('PJ')
    const arquivo = await exportState(origem)

    const destino = setup()
    const resumo = await importState(arquivo, destino)
    assert.ok(resumo)
    assert.equal(resumo.plans, 1)
    assert.equal(resumo.overrides, 1)
    assert.equal((await destino.plans.list()).items[0].label, 'Monitor')
    assert.deepEqual(await destino.overrides.list(), { tx1: 'mercado' })
    assert.equal((await destino.preferences.load()).scope, 'PJ')
  })

  it('preserva os RegExp das regras, que o JSON perderia', async () => {
    // `JSON.stringify(/x/i)` é `{}` sem erro nenhum: sem o tratamento, o arquivo importaria
    // "com sucesso" e deixaria a categorização sem regra alguma.
    const origem = setup()
    await origem.config.replace({ ...seedConfig(), rules: [{ id: 'padaria', test: /PADARIA|PAO/i, category: 'mercado' }] as never })
    const destino = setup()
    await importState(await exportState(origem), destino)
    const regra = (await destino.config.load()).rules[0]
    assert.ok(regra.test instanceof RegExp)
    assert.ok(regra.test.test('padaria do bairro'))
  })

  it('recusa arquivo de outro app em vez de apagar o que existe', async () => {
    const destino = setup()
    await destino.plans.addPlan({ label: 'Cadeira', categoryId: 'tecnologia', cash: 900 })
    assert.equal(await importState('{"app":"outro","version":1,"payload":{}}', destino), null)
    assert.equal((await destino.plans.list()).items.length, 1, 'nada foi apagado')
  })

  it('restaura as partes de forma INDEPENDENTE', async () => {
    // Um arquivo antigo, com só uma parte, ainda restaura essa parte. Recusar o arquivo
    // inteiro transformaria uma cópia parcial em nenhuma cópia.
    const destino = setup()
    const soPlanos = JSON.stringify({ app: 'wlet', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', payload: { plans: { ...emptyPlans(), items: [] } } })
    const resumo = await importState(soPlanos, destino)
    assert.ok(resumo)
    assert.equal(resumo.declarations, false)
    assert.equal(resumo.preferences, false)
    assert.equal(resumo.plans, 0)
  })

  it('a configuração importada passa pela MESMA validação', async () => {
    // Vir de um export não torna o arquivo confiável: ele pode ter sido editado entre uma
    // coisa e outra.
    const destino = setup()
    const torto = JSON.stringify({
      app: 'wlet',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      payload: { declarations: { ...seedConfig(), budget: { monthlyLimit: -1, warnAt: 0.75, byCategory: [] } } },
    })
    await assert.rejects(() => importState(torto, destino), /inválida|negativo/i)
  })
})
