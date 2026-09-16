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
// `Services` é a forma do composition root do APP (`apps/web/src/lib/services.ts`), não do pacote:
// `@wlet/services` exporta as PEÇAS, e a montagem é de quem sabe onde roda. O import apontava para
// o pacote e não resolvia — invisível enquanto `scripts/` não era typechecked.
import type { Services } from '../../src/lib/services.ts'

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
    // **O que ele CASA não basta, e o que ele NÃO casa é a metade que importa.** As duas asserções
    // que estavam aqui — `instanceof RegExp` e `.test('padaria do bairro')` — passam com uma
    // expressão VAZIA, porque `//` casa qualquer texto. E esse é justamente o pior desfecho: uma
    // regra que casa tudo manda TODA transação para a primeira categoria da lista, com o valor
    // certo e a conta errada.
    //
    // Por isso o padrão e as flags ficam presos, e há um caso negativo ao lado.
    assert.ok(regra.test instanceof RegExp)
    assert.equal(regra.test.source, 'PADARIA|PAO')
    assert.equal(regra.test.flags, 'i')
    assert.ok(regra.test.test('padaria do bairro'), 'casa o que deve')
    assert.equal(regra.test.test('MERCADO CENTRAL'), false, 'e NÃO casa o que não deve — uma regra vazia casaria')
  })

  it('a configuração importada passa pela MESMA validação', async () => {
    const destino = setup()
    const torto = { declarations: { ...seedConfig(), budget: { monthlyLimit: -1, warnAt: 0.75, byCategory: [] } } }
    await assert.rejects(() => importState(torto as never, ['declarations'], destino), /inválida|negativo/i)
  })
})

/**
 * A PRÉVIA NÃO PODE MENTIR SOBRE UM PACOTE INCOMPLETO.
 *
 * `inspectPackage` existe para o diálogo mostrar o que vai SUBSTITUIR antes de substituir — o
 * docblock diz por quê: "importar e ver no que dá" é o oposto disso num app cujo armazenamento é a
 * única cópia. Os testes acima a exercitam com pacotes inteiros, gerados pelo próprio `exportState`.
 *
 * O que faltava é o pacote TORTO, e ele é o caso realista: arquivo truncado numa cópia interrompida,
 * pacote de uma versão que ainda não tinha uma seção, arquivo editado à mão para tirar algo. Em
 * todos, a prévia é o único lugar onde a pessoa pode perceber — e ela decide sobre o número que a
 * prévia mostra.
 *
 * Os dois erros possíveis são opostos e ambos caros. Dizer "0" sobre uma seção que tem conteúdo faz
 * a pessoa importar achando que não perde nada; desenhar uma seção que está vazia faz ela recusar um
 * pacote bom, ou pior, substituir dado por vazio.
 */
const packageOf = (payload: Record<string, unknown>) => JSON.stringify({ app: 'wlet', version: 2, exportedAt: '2026-01-01T00:00:00.000Z', payload })

describe('pacote: a prévia de um arquivo incompleto', () => {
  it('seção AUSENTE é `null`, e não zero', () => {
    // A distinção carrega significado: `null` é "este pacote não traz isto", e `0` é "traz, e está
    // vazio". Confundi-los faz o diálogo oferecer substituir um conjunto de 500 lançamentos por
    // nada, com a mesma aparência de quem não vai mexer neles.
    const lido = inspectPackage(packageOf({}))
    assert.ok(lido)
    assert.deepEqual(lido.contents, { dataset: null, declarations: null, plans: null, overrides: null, preferences: false, sources: null })
  })

  it('seção PRESENTE e vazia é zero, e não `null`', () => {
    const lido = inspectPackage(packageOf({ plans: { version: 1, groups: [], items: [] }, overrides: {}, sources: [] }))
    assert.ok(lido)
    assert.equal(lido.contents.plans, 0)
    assert.equal(lido.contents.overrides, 0)
    assert.equal(lido.contents.sources, 0)
  })

  it('conjunto SEM lançamentos não é desenhado — é o que o diálogo trata como "não traz conjunto"', () => {
    // A leitura pende de `transactions`, e não da presença do objeto: um `dataset` que veio só com
    // `meta` não substitui nada de útil, e mostrá-lo como seção convidaria a marcar a caixa.
    const lido = inspectPackage(packageOf({ dataset: { meta: { months: [] } } }))
    assert.ok(lido)
    assert.equal(lido.contents.dataset, null)
  })

  it('e conjunto COM lançamentos mas sem contas conta zero contas, sem estourar', () => {
    const lido = inspectPackage(packageOf({ dataset: { transactions: [{ id: 'a' }, { id: 'b' }] } }))
    assert.ok(lido)
    assert.deepEqual(lido.contents.dataset, { transactions: 2, accounts: 0 })
  })

  it('declaração com metade das seções conta as que vieram e zera as outras', () => {
    // O caso do pacote de uma versão anterior: ele tem `planned` e não tem `goals`. Zerar é a
    // leitura certa — a seção existe no formato e está vazia neste arquivo.
    const lido = inspectPackage(packageOf({ declarations: { planned: [{ id: 'p1' }], rules: [{ id: 'r1' }, { id: 'r2' }] } }))
    assert.ok(lido)
    assert.deepEqual(lido.contents.declarations, { planned: 1, receivables: 0, goals: 0, rules: 2, accounts: 0 })
  })

  it('planos sem a lista de itens não são desenhados', () => {
    const lido = inspectPackage(packageOf({ plans: { version: 1, groups: [] } }))
    assert.ok(lido)
    assert.equal(lido.contents.plans, null)
  })
})

describe('pacote: preferências pela metade', () => {
  it('só o que veio é gravado — o que falta fica como está', async () => {
    // As três preferências são independentes, e o pacote pode trazer uma só. Gravar as ausentes
    // como `undefined` apagaria a escolha de quem importou: o tema voltaria ao padrão porque o
    // arquivo de outra máquina não falava de tema.
    const destino = setup()
    await destino.preferences.setTheme('dark')
    await destino.preferences.setScope('PJ')

    const lido = inspectPackage(packageOf({ preferences: { period: { from: '2026-03', to: '2026-05' } } }))
    assert.ok(lido)
    await importState(lido.payload, ['preferences'], destino)

    const prefs = await destino.preferences.load()
    assert.deepEqual(prefs.period, { from: '2026-03', to: '2026-05' }, 'o que veio entrou')
    assert.equal(prefs.theme, 'dark', 'e o que não veio sobreviveu')
    assert.equal(prefs.scope, 'PJ')
  })
})
