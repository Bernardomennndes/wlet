import { dataset as loadedDataset } from '@/lib/dataset'
import {
  createConfigService,
  createDatasetService,
  createOverridesService,
  createPlansService,
  createPreferencesService,
  type ConfigService,
  type DatasetService,
  type OverridesService,
  type PlansService,
  type PreferencesService,
} from '@wlet/services'
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
} from '@wlet/services'
import { makeBundleDeclarations } from './bundle-declarations.adapter'
import { makeBundleSeed } from './bundle-seed.adapter'

/**
 * A ORIGEM dos dados, decidida no build.
 *
 * Com `VITE_API_URL` o app fala com o servidor; sem ela, com o próprio navegador. Não é uma
 * bandeira temporária: os dois modos são legítimos e vão continuar existindo — o local é o que
 * mantém a promessa de que nada sai da máquina, e o remoto é o que permite abrir a mesma conta
 * em dois aparelhos. Quem escolhe é quem instala.
 */
// O acesso é DEFENSIVO porque `import.meta.env` não existe fora do Vite, e o runner dos
// testes roda por tsx: sem o `?.`, importar este módulo estoura em Node com "Cannot read
// properties of undefined" — que foi o que quebrou o teste do portão de boot. Mesma armadilha
// do `import.meta.glob` em `generated-files.ts`.
const apiUrl = (import.meta.env as Record<string, string> | undefined)?.VITE_API_URL

/**
 * O composition root da camada de serviços: o único lugar que monta os cinco contextos.
 *
 * A §4 proíbe um contexto alcançar as entranhas de outro, e este arquivo é o que torna isso
 * praticável — a tela pede `services().plans` e nunca sabe qual adapter está por baixo, nem
 * precisa saber montar um.
 *
 * **Instância única, criada sob demanda.** Os adapters não guardam estado (o `localStorage` e o
 * IndexedDB são o estado), então instância única é economia, não semântica. Sob demanda porque
 * `createConfigService` e os irmãos tocam `localStorage` e `indexedDB` ao serem chamados, e
 * chamá-los na avaliação do módulo faria este arquivo ter efeito colateral só por ser
 * importado — exatamente o defeito que `scripts/cdi.ts` já teve, quando um import disparava um
 * download.
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
  if (!instance) {
    instance = apiUrl ? remoto(apiUrl) : local()
  }
  return instance
}

/** Tudo no navegador: IndexedDB, `localStorage` e o pipeline no Web Worker. */
function local(): Services {
  const dataset = createDatasetService(makeBundleSeed())
  return {
    dataset,
    // A semente da config é o que o ingest gravou e veio no dataset: `config` não pode
    // conhecer quem produziu aquele JSON (§4), então ele recebe a leitura por porta.
    // A semente vem do BUNDLE, não do conjunto: `config` não pode conhecer quem produziu
    // aquele JSON (§4), e depois que as declarações saíram do `Dataset` não haveria de onde
    // tirá-las por ali de qualquer modo.
    config: createConfigService(makeBundleDeclarations()),
    plans: createPlansService(),
    overrides: createOverridesService(),
    // O piso vem daqui e não do barrel de `preferences`: `@/lib/dataset` é o PORTÃO, que
    // não lê nada ao ser avaliado, enquanto `@/lib/finance` lê. A diferença é entre o app
    // abrir e o app abrir em branco.
    preferences: createPreferencesService(() => loadedDataset().meta.months[0]),
  }
}

/**
 * Tudo no servidor. Os MESMOS serviços, com outra infraestrutura por baixo.
 *
 * É o que a camada hexagonal comprou: os casos de uso, as validações e os 168 testes seguem
 * idênticos — só muda quem responde às portas. Nenhuma tela sabe a diferença.
 */
function remoto(baseUrl: string): Services {
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
    config: makeConfigService({ repository: makeOrpcConfigRepository(deps), seed: makeBundleDeclarations() }),
    plans: makePlansService({ repository: makeOrpcPlanRepository(deps), ids: { next: () => `plan-${Date.now().toString(36)}` } }),
    // `categoryExists` é regra de DOMÍNIO, não de armazenamento: um ajuste para uma categoria
    // que não existe é inválido aqui e no servidor igualmente, e o catálogo é o mesmo pacote.
    overrides: makeOverridesService({ repository: makeOrpcOverrideRepository(deps), categoryExists: (id) => id in CATEGORY_MAP }),
    preferences: makePreferencesService({ repository: makeOrpcPreferencesRepository(deps), floorMonth: () => loadedDataset().meta.months[0] }),
  }
}

/** Descarta a instância. Existe para o teste, e para um "reiniciar" futuro não vazar estado. */
export function resetServices(): void {
  instance = null
}
