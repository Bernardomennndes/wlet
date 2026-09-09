import { dataset as loadedDataset } from '@/lib/dataset'
import { createConfigService, type ConfigService } from './config'
import { createDatasetService, type DatasetService } from './dataset'
import { createOverridesService, type OverridesService } from './overrides'
import { createPlansService, type PlansService } from './plans'
import { createPreferencesService, type PreferencesService } from './preferences'

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
    const dataset = createDatasetService()
    instance = {
      dataset,
      // A semente da config é o que o ingest gravou e veio no dataset: `config` não pode
      // conhecer quem produziu aquele JSON (§4), então ele recebe a leitura por porta.
      config: createConfigService({
        read: async () => {
          const { data } = await dataset.load()
          // `trips` sai VAZIO, e não é esquecimento: o ingest grava `src/generated/trips.json`,
          // mas nenhuma tela o lê hoje — ele não faz parte do `Dataset` que o app carrega.
          // Semear com lista vazia é o que corresponde à verdade; inventar viagem não.
          return {
            planned: data.planned,
            budget: data.budget,
            receivables: data.receivables,
            goals: data.goals,
            trips: [],
            // Os três nascem VAZIOS, e isso não é lacuna — é o que o pipeline espera de quem
            // ainda não configurou nada. Sem perfil de conta ele CRIA a conta a partir dos
            // metadados do arquivo (e avisa no relatório); sem regra sua, valem as genéricas,
            // que já estão no código; sem nome próprio, nenhuma transferência é reconhecida
            // como sua, o que é o certo — inventar um nome casaria transferência alheia.
            // O `ingest` do terminal continua passando os do disco.
            accounts: [],
            rules: [],
            selfNames: [],
          }
        },
      }),
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

export type { ConfigService } from './config'
export type { DatasetService } from './dataset'
export type { OverridesService } from './overrides'
export type { PlansService } from './plans'
export type { PreferencesService } from './preferences'
