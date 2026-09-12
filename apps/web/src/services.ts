import { createWletClient } from '@wlet/api'
import { CATEGORY_MAP } from '@wlet/domain'
import {
  makeConfigService,
  makeDatasetService,
  makeOrpcConfigRepository,
  makeOrpcDatasetRepository,
  makeOrpcIngestRunner,
  makeOrpcOverrideRepository,
  makeOrpcPlanRepository,
  makeOrpcPreferencesRepository,
  makeOrpcSourceStore,
  makeOverridesService,
  makePlansService,
  makePreferencesService,
  type ConfigService,
  type DatasetService,
  type OverridesService,
  type PlansService,
  type PreferencesService,
} from '@wlet/services'
import { apiUrl } from './api-url'
import { makeBundleDeclarations } from './bundle-declarations.adapter'
import { makeBundleSeed } from './bundle-seed.adapter'
import { dataset as loadedDataset } from '@/lib/dataset'

/**
 * O composition root da camada de serviços: o único lugar que monta os cinco contextos.
 *
 * A §4 proíbe um contexto alcançar as entranhas de outro, e este arquivo é o que torna isso
 * praticável — a tela pede `services().plans` e nunca sabe qual adapter está por baixo, nem
 * precisa saber montar um.
 *
 * **Há UMA origem: o servidor.** Havia duas, escolhidas pela presença de `VITE_API_URL`, e a
 * ramificação custava mais do que entregava: todo dado tinha duas respostas possíveis conforme
 * onde fosse lido, o `pnpm ingest` do terminal nunca enxergava o que o navegador tinha guardado,
 * e a mesma conta aberta em dois aparelhos mostrava números diferentes sem nada avisar. O que os
 * adapters locais ofereciam em troca — "nada sai da máquina" — a instalação própria continua
 * oferecendo, porque o servidor é seu.
 *
 * **Instância única, criada sob demanda.** Os adapters não guardam estado (o servidor é o
 * estado), então instância única é economia, não semântica. Sob demanda porque `apiUrl()` LANÇA
 * quando a variável falta, e fazer isso na avaliação do módulo transformaria um erro de
 * configuração numa página em branco — o import acontece antes de qualquer `catch` existir.
 */
export interface Services {
  dataset: DatasetService
  config: ConfigService
  plans: PlansService
  overrides: OverridesService
  preferences: PreferencesService
}

let instance: Services | null = null

export function services(): Services {
  instance ??= build(apiUrl())
  return instance
}

/**
 * Monta os cinco contextos sobre um endereço EXPLÍCITO.
 *
 * Separada de `services()` para que a montagem possa ser exercitada sem ambiente — é o que
 * `scripts/checks/services-boot.test.ts` faz, e a propriedade que ele tranca (montar não lê o
 * dataset) não tem nada a ver com de onde a URL veio.
 */
export function build(baseUrl: string): Services {
  const deps = { client: createWletClient({ baseUrl, token: () => localStorage.getItem('wlet.token') }) }
  return {
    dataset: makeDatasetService({
      repository: makeOrpcDatasetRepository(deps),
      // A semente do bundle continua valendo: um servidor vazio abre com a demonstração, em vez
      // de uma tela de zeros que não explica nada.
      seed: makeBundleSeed(),
      runner: makeOrpcIngestRunner(deps),
      sources: makeOrpcSourceStore(deps),
    }),
    // A semente da config vem do BUNDLE, não do conjunto: `config` não pode conhecer quem
    // produziu aquele JSON (§4).
    config: makeConfigService({ repository: makeOrpcConfigRepository(deps), seed: makeBundleDeclarations() }),
    plans: makePlansService({ repository: makeOrpcPlanRepository(deps), ids: { next: () => `plan-${Date.now().toString(36)}` } }),
    // `categoryExists` é regra de DOMÍNIO, não de armazenamento: um ajuste para uma categoria
    // que não existe é inválido aqui e no servidor igualmente, e o catálogo é o mesmo pacote.
    overrides: makeOverridesService({ repository: makeOrpcOverrideRepository(deps), categoryExists: (id) => id in CATEGORY_MAP }),
    // O piso vem de `@/lib/dataset` e não do barrel de `finance`: aquele é o PORTÃO, que não lê
    // nada ao ser avaliado, enquanto `finance` lê. A diferença é entre o app abrir e o app abrir
    // em branco.
    preferences: makePreferencesService({ repository: makeOrpcPreferencesRepository(deps), floorMonth: () => loadedDataset().meta.months[0] }),
  }
}

/** Descarta a instância. Existe para o teste, e para um "reiniciar" futuro não vazar estado. */
export function resetServices(): void {
  instance = null
}
