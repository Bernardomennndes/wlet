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
import { makeBundleDeclarations } from './bundle-declarations.adapter'
import { makeBundleSeed } from './bundle-seed.adapter'

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
    const dataset = createDatasetService(makeBundleSeed())
    instance = {
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
  return instance
}

/** Descarta a instância. Existe para o teste, e para um "reiniciar" futuro não vazar estado. */
export function resetServices(): void {
  instance = null
}
