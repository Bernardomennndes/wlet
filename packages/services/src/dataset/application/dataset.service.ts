import { emptyDataset, type Dataset } from '@wlet/domain'
import type { SourceFile } from '@wlet/ingest/io'
import type { Declarations, IngestReport } from '@wlet/ingest/pipeline'
import { IncompleteDatasetError, NoSourcesError } from '../domain/errors'
import type { DatasetRepository, DatasetSeed } from '../domain/ports/dataset-repository'
import type { IngestRunner } from '../domain/ports/ingest-runner'
import type { SourceStore } from '../domain/ports/source-store'

/**
 * Os casos de uso do conjunto ingerido.
 *
 * O serviço não CALCULA nada sobre os dados (§5): recorte, agregação mensal, previsão e
 * conciliação vivem em `src/lib/` e são lidos por 25 arquivos. Aqui só mora de onde o conjunto
 * vem, para onde ele vai, e a garantia de que ele está inteiro antes de ser publicado.
 */
/**
 * As cinco partes do conjunto MEDIDO.
 *
 * Eram nove: as declarações também eram gravadas aqui, e o app as lia daqui — duas cópias do
 * mesmo dado, e mudar uma rubrica não mexia em número nenhum até reingerir. Elas moram no
 * contexto `config` agora.
 */
export const DATASET_PARTS = ['accounts', 'meta', 'transactions', 'transfers', 'investments'] as const

/**
 * De onde o conjunto veio neste boot.
 *
 * `'stored'` era `'indexeddb'` enquanto havia um navegador guardando: o nome dizia a TECNOLOGIA
 * do armazenamento, e quando ela mudou para Postgres do outro lado de `/v1` o rótulo passou a
 * mentir para a tela de Meus dados, que o exibe. O que a pessoa precisa saber é se o número na
 * frente dela é o DELA ou a demonstração que veio no aplicativo — e essa distinção não depende
 * de onde os bytes moram.
 */
export type DatasetOrigin = 'stored' | 'seed' | 'empty'

export interface DatasetServiceDeps {
  repository: DatasetRepository
  seed: DatasetSeed
  runner: IngestRunner
  sources: SourceStore
}

export interface DatasetService {
  /** O conjunto para o boot, e de qual origem ele veio. Nunca falha: a semente é o piso. */
  load(): Promise<{ data: Dataset; origin: DatasetOrigin }>
  /** Substitui o conjunto — é o que uma ingestão no navegador produz. */
  replace(data: Dataset): Promise<Dataset>
  /** Descarta o gravado e volta à cópia que veio no aplicativo. */
  reset(): Promise<Dataset>
  /**
   * Lê extratos e faturas e SUBSTITUI o conjunto — a ingestão, agora no navegador.
   *
   * Devolve o relatório junto do conjunto porque ele é a única coisa que explica um número
   * estranho: duplicado descartado, fatura recusada, transferência sem contraparte, conta
   * criada sozinha. No terminal ele era impresso; aqui ele precisa chegar à tela, senão o
   * ingest do navegador seria mais silencioso que o do terminal — o contrário do que se quer.
   */
  ingest(sources: SourceFile[], config: Declarations, now: string): Promise<{ data: Dataset; report: IngestReport }>
  /**
   * Reprocessa os arquivos JÁ GUARDADOS, com a configuração de agora.
   *
   * É o que dá efeito a uma mudança em `accounts` ou `rules`: as duas agem durante a LEITURA
   * do arquivo — uma decide de que conta ele é, a outra que categoria cada lançamento recebe —,
   * então nenhuma altera nada sem o arquivo passar de novo pelo pipeline. Sem isto, cada ajuste
   * de regra exigiria escolher a pasta outra vez.
   */
  reingest(config: Declarations, now: string): Promise<{ data: Dataset; report: IngestReport }>
  /** Quantos arquivos estão guardados. Zero significa que só resta escolher a pasta. */
  storedSources(): Promise<number>
  /** Os arquivos guardados, para irem num pacote de exportação. */
  readSources(): Promise<SourceFile[]>
  /** Substitui os arquivos guardados — o caminho da importação de um pacote. */
  writeSources(sources: SourceFile[]): Promise<void>
}

/**
 * Um conjunto meio gravado é indistinguível de um íntegro para quem só confere se as chaves
 * existem, então a integridade é conferida pelo CONTEÚDO antes de publicar.
 */
function assertComplete(data: Dataset): void {
  const missing = DATASET_PARTS.filter((part) => data[part] === undefined || data[part] === null)
  if (missing.length) throw new IncompleteDatasetError(missing)
}

export function makeDatasetService({ repository, seed, runner, sources: sourceStore }: DatasetServiceDeps): DatasetService {
  return {
    async load() {
      // Servidor inacessível, conjunto corrompido ou resposta lenta não podem impedir o app de
      // abrir — a semente
      // responde, e ela é um app inteiro funcionando. Quem chamou recebe a origem e decide o
      // que dizer na tela.
      try {
        const saved = await repository.find()
        if (saved) {
          assertComplete(saved)
          return { data: saved, origin: 'stored' as const }
        }
      } catch {
        // cai na semente
      }
      // Sem nada gravado E sem semente no build, o app abre VAZIO em vez de recusar-se a
      // abrir: é exatamente a situação de quem acabou de clonar, e a tela que ele precisa
      // alcançar — "Meus dados" — é a que resolve o problema.
      const planted = await seed.read()
      if (!planted) return { data: emptyDataset(), origin: 'empty' as const }
      return { data: planted, origin: 'seed' as const }
    },

    async replace(data) {
      assertComplete(data)
      await repository.save(data)
      return data
    },

    async ingest(sources, config, now) {
      // Guarda ANTES de executar, e a ordem não é preferência: o executor TRANSFERE os buffers
      // para o worker, e depois disso eles ficam destacados e ilegíveis aqui. Gravar depois
      // gravaria vazio — sem erro nenhum.
      await sourceStore.save(sources)
      return run(sources, config, now)
    },

    async reingest(config, now) {
      const stored = await sourceStore.load()
      if (!stored.length) throw new NoSourcesError()
      return run(stored, config, now)
    },

    storedSources: () => sourceStore.count(),

    readSources: () => sourceStore.load(),

    writeSources: (sources) => sourceStore.save(sources),

    async reset() {
      // Sem semente no build, voltar ao início é voltar ao VAZIO — que é literalmente o
      // estado de origem deste app.
      const fresh = (await seed.read()) ?? emptyDataset()
      await repository.clear()
      await sourceStore.clear()
      return fresh
    },
  }

  async function run(sources: SourceFile[], config: Declarations, now: string): Promise<{ data: Dataset; report: IngestReport }> {
    const result = await runner.run(sources, config, now)
    const data: Dataset = {
      accounts: result.accounts,
      meta: result.meta,
      transactions: result.transactions,
      transfers: result.transfers,
      investments: result.investments,
    }
    // Passa pela MESMA conferência de `replace`: uma ingestão que produziu conjunto
    // incompleto não pode substituir um conjunto íntegro.
    assertComplete(data)
    await repository.save(data)
    return { data, report: result.report }
  }
}
