import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyPlans } from '@wlet/domain/plans'
import { fromBase64, toBase64 } from '@wlet/lib/portable'
import { exportState, importState, inspectPackage, PACKAGE_PARTS } from '@wlet/services/backup'
import { makeConfigService } from '@wlet/services/config/application/config.service'
import { makeFakeConfigRepository, makeFakeSeed as makeFakeConfigSeed, seedConfig } from '@wlet/services/config/test-support/fake-config-repository'
import { makeDatasetService } from '@wlet/services/dataset/application/dataset.service'
import { makeFakeDatasetRepository, makeFakeRunner, makeFakeSeed, makeFakeSourceStore, seedDataset } from '@wlet/services/dataset/test-support/fake-dataset-repository'
import { makeOverridesService } from '@wlet/services/overrides/application/overrides.service'
import { makeFakeOverrideRepository } from '@wlet/services/overrides/test-support/fake-override-repository'
import { makePlansService } from '@wlet/services/plans/application/plans.service'
import { makeFakePlanRepository, makeSequentialIds } from '@wlet/services/plans/test-support/fake-plan-repository'
import { makePreferencesService } from '@wlet/services/preferences/application/preferences.service'
import { makeFakePreferencesRepository } from '@wlet/services/preferences/test-support/fake-preferences-repository'
import type { Services } from '@wlet/services/index'

/**
 * A ida e volta do pacote.
 *
 * Ele existe por duas razões que pedem coisas diferentes: guardar contra o despejo do
 * armazenamento, e TRANSPORTAR — gerar num lugar e inserir noutro. A segunda é o que obriga o
 * conjunto e os arquivos a viajarem junto. Uma cópia que não volta é pior que nenhuma, porque
 * dá a impressão de que existe.
 */
function setup(): Services {
  const sourceStore = makeFakeSourceStore()
  return {
    dataset: makeDatasetService({ repository: makeFakeDatasetRepository(seedDataset()), seed: makeFakeSeed(seedDataset()), runner: makeFakeRunner({}), sources: sourceStore }),
    config: makeConfigService({ repository: makeFakeConfigRepository(), seed: makeFakeConfigSeed(seedConfig()) }),
    plans: makePlansService({ repository: makeFakePlanRepository(), ids: makeSequentialIds() }),
    overrides: makeOverridesService({ repository: makeFakeOverrideRepository(), categoryExists: () => true }),
    preferences: makePreferencesService({ repository: makeFakePreferencesRepository(), floorMonth: () => '2026-01' }),
  }
}

describe('pacote: base64 dos arquivos', () => {
  it('leva e traz os bytes intactos', () => {
    // JSON não tem tipo binário, e a conversão é em fatias porque `fromCharCode(...bytes)`
    // sobre megabytes estoura a pilha de argumentos.
    const bytes = new Uint8Array(200_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
    assert.deepEqual([...fromBase64(toBase64(bytes))], [...bytes])
  })

  it('aguenta o vazio e o byte alto', () => {
    assert.equal(toBase64(new Uint8Array(0)), '')
    assert.deepEqual([...fromBase64(toBase64(new Uint8Array([0, 255, 128])))], [0, 255, 128])
  })
})

describe('pacote: inspeção antes de gravar', () => {
  it('diz o que há dentro sem escrever nada', async () => {
    const origem = setup()
    await origem.plans.addPlan({ label: 'Monitor', categoryId: 'tecnologia', cash: 3000 })
    await origem.overrides.set('tx1', 'mercado')
    const lido = inspectPackage(await exportState(origem))
    assert.ok(lido)
    assert.equal(lido.contents.plans, 1)
    assert.equal(lido.contents.overrides, 1)
    assert.ok(lido.contents.declarations)
    assert.equal(lido.contents.declarations.planned, 1)
  })

  it('recusa arquivo de outro app', () => {
    assert.equal(inspectPackage('{"app":"outro","version":2,"payload":{}}'), null)
    assert.equal(inspectPackage('não é json'), null)
  })

  it('lê o formato ANTIGO, da versão 1', () => {
    // A versão 1 só tinha declarações, planos, ajustes e preferências. Recusá-la
    // transformaria uma cópia existente em nenhuma.
    const antigo = JSON.stringify({ app: 'wlet', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', payload: { plans: { ...emptyPlans(), items: [] } } })
    const lido = inspectPackage(antigo)
    assert.ok(lido)
    assert.equal(lido.contents.plans, 0)
    assert.equal(lido.contents.dataset, null)
  })
})

describe('pacote: importação seletiva', () => {
  it('traz só as partes escolhidas', async () => {
    const origem = setup()
    await origem.plans.addPlan({ label: 'Monitor', categoryId: 'tecnologia', cash: 3000 })
    await origem.overrides.set('tx1', 'mercado')
    const lido = inspectPackage(await exportState(origem))
    assert.ok(lido)

    const destino = setup()
    const resumo = await importState(lido.payload, ['plans'], destino)
    assert.deepEqual(resumo.imported, ['plans'])
    assert.equal((await destino.plans.list()).items.length, 1)
    assert.deepEqual(await destino.overrides.list(), {}, 'o que não foi escolhido não entrou')
  })

  it('traz tudo quando tudo é escolhido', async () => {
    const origem = setup()
    await origem.overrides.set('tx1', 'mercado')
    await origem.preferences.setScope('PJ')
    const lido = inspectPackage(await exportState(origem))
    assert.ok(lido)

    const destino = setup()
    const resumo = await importState(lido.payload, PACKAGE_PARTS, destino)
    assert.ok(resumo.imported.includes('dataset'))
    assert.ok(resumo.imported.includes('declarations'))
    assert.equal((await destino.preferences.load()).scope, 'PJ')
    assert.deepEqual(await destino.overrides.list(), { tx1: 'mercado' })
  })

  it('grava as DECLARAÇÕES antes do conjunto', async () => {
    // O id de cada lançamento embute o perfil de conta. A ordem é o que garante que os dois
    // fiquem coerentes quando ambos são escolhidos.
    const ordem: string[] = []
    const destino = setup()
    const espiao: Services = {
      ...destino,
      config: { ...destino.config, replace: async (c) => (ordem.push('declarations'), destino.config.replace(c)) },
      dataset: { ...destino.dataset, replace: async (d) => (ordem.push('dataset'), destino.dataset.replace(d)) },
    }
    const lido = inspectPackage(await exportState(setup()))
    assert.ok(lido)
    await importState(lido.payload, ['dataset', 'declarations'], espiao)
    assert.deepEqual(ordem, ['declarations', 'dataset'])
  })

  it('os arquivos originais voltam byte a byte', async () => {
    const origem = setup()
    await origem.dataset.writeSources([{ path: 'docs/extrato/a.ofx', bytes: new Uint8Array([79, 70, 88, 0, 255]) }])
    const lido = inspectPackage(await exportState(origem))
    assert.ok(lido)
    assert.equal(lido.contents.sources, 1)

    const destino = setup()
    await importState(lido.payload, ['sources'], destino)
    const voltou = await destino.dataset.readSources()
    assert.equal(voltou[0].path, 'docs/extrato/a.ofx')
    assert.deepEqual([...voltou[0].bytes], [79, 70, 88, 0, 255])
  })

  it('preserva os RegExp das regras, que o JSON perderia', async () => {
    // `JSON.stringify(/x/i)` é `{}` sem erro nenhum: sem tratamento, o arquivo importaria
    // "com sucesso" e deixaria a categorização sem regra alguma.
    const origem = setup()
    await origem.config.replace({ ...seedConfig(), rules: [{ id: 'padaria', test: /PADARIA|PAO/i, category: 'mercado' }] as never })
    const lido = inspectPackage(await exportState(origem))
    assert.ok(lido)

    const destino = setup()
    await importState(lido.payload, ['declarations'], destino)
    const regra = (await destino.config.load()).rules[0]
    assert.ok(regra.test instanceof RegExp)
    assert.ok(regra.test.test('padaria do bairro'))
  })

  it('a configuração importada passa pela MESMA validação', async () => {
    const destino = setup()
    const torto = { declarations: { ...seedConfig(), budget: { monthlyLimit: -1, warnAt: 0.75, byCategory: [] } } }
    await assert.rejects(() => importState(torto as never, ['declarations'], destino), /inválida|negativo/i)
  })
})
