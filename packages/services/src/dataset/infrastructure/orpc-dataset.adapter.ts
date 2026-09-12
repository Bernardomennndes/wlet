import type { Dataset } from '@wlet/domain'
import { fromBase64, toBase64 } from '@wlet/lib/portable'
import type { SourceFile } from '@wlet/ingest/io'
import type { Declarations } from '@wlet/ingest/pipeline'
import { remote, type RemoteDeps } from '../../shared/infrastructure/orpc'
import type { DatasetRepository } from '../domain/ports/dataset-repository'
import type { IngestRunner } from '../domain/ports/ingest-runner'
import type { SourceStore } from '../domain/ports/source-store'

/**
 * O conjunto, no servidor.
 *
 * `save` grava um conjunto PRONTO, sem passar pelo pipeline: é o caminho da IMPORTAÇÃO de um
 * pacote, e a diferença entre ele e `ingest` é o motivo de a rota existir. Reingerir os
 * arquivos do pacote recalcularia todo `transaction.id` — que é `sha1` de sete campos,
 * incluindo o `profile.id` do perfil de conta — e todo ajuste manual de categoria, chaveado
 * por esse id, viraria órfão em silêncio.
 *
 * Enquanto este método era um corpo vazio ele MENTIA sobre sucesso: a importação descartava o
 * conjunto inteiro e a tela dizia "Importado".
 */
export function makeOrpcDatasetRepository({ client }: RemoteDeps): DatasetRepository {
  return {
    find() {
      return remote(async () => (await client.dataset.get()) as Dataset | null)
    },
    async save(data: Dataset) {
      // `PUT /dataset` publica numa transação só — meio conjunto gravado é pior que nenhum, e é
      // por isso que o corpo vai inteiro e não paginado.
      await remote(() => client.dataset.replace(data))
    },
    async clear() {
      await remote(() => client.dataset.reset())
    },
  }
}

/**
 * A ingestão, no servidor.
 *
 * Os ARQUIVOS sobem e volta o conjunto já publicado. Houve um adapter de Web Worker aqui ao
 * lado, que rodava o pipeline no navegador e devolvia o resultado para ser gravado; a porta
 * `IngestRunner` é a mesma nos dois casos, e é por isso que o serviço nunca soube a diferença.
 *
 * O `config` que o serviço passa é IGNORADO de propósito: quem manda é a configuração gravada no
 * servidor, e ela já está lá. Aceitar a do cliente abriria a porta para o pipeline rodar com uma
 * configuração que o `GET /config` não confirma — dois estados para a mesma pergunta.
 */
export function makeOrpcIngestRunner({ client }: RemoteDeps): IngestRunner {
  return {
    async run(_sources: SourceFile[], _config: Declarations, _now: string) {
      /**
       * Processa o que JÁ ESTÁ no servidor, e por isso `sources` é ignorado.
       *
       * O serviço chama `sourceStore.save(sources)` imediatamente antes de `run`
       * (`dataset.service.ts`, em `ingest`) — então, quando esta linha executa, os arquivos
       * acabaram de subir por `PUT /dataset/sources`. Mandá-los de novo em `POST /dataset/ingest`
       * subiria os MESMOS ~15 MB uma segunda vez e reescreveria a tabela `source_files` duas
       * vezes por ingestão. Foi o defeito que a primeira ligação de `save` introduziu: o
       * `ingest` do servidor também grava a pasta, e ninguém olhou o chamador.
       *
       * `reingest` é exatamente "rode o pipeline sobre o que está guardado", e existia sem
       * nenhum chamador. É a rota certa para este par — o upload é de `save`, o processamento é
       * daqui, e cada byte sobe uma vez só.
       */
      const { dataset, report } = await remote(() => client.dataset.reingest({}))
      return { ...(dataset as unknown as Record<string, unknown>), report } as never
    },
  }
}

/**
 * Os arquivos-fonte, no servidor.
 *
 * `save` e `load` existem aqui pelas duas pontas do PACOTE: importar um pacote precisa repor os
 * originais sem rodar o pipeline (senão o primeiro `reingest` seguinte falha por não haver
 * fonte nenhuma), e exportar um pacote precisa trazê-los de volta. Nenhuma das duas passa por
 * `ingest`, que guarda os arquivos apenas como efeito colateral de reprocessá-los.
 */
export function makeOrpcSourceStore({ client }: RemoteDeps): SourceStore {
  return {
    async save(sources: SourceFile[]) {
      // `PUT /dataset/sources` SUBSTITUI a pasta inteira: um extrato que a pessoa apagou não
      // pode continuar produzindo lançamentos. Base64 pelo mesmo motivo do `ingest` acima —
      // JSON não tem tipo binário —, e pelo mesmo helper.
      await remote(() =>
        client.dataset.writeSources({
          sources: sources.map((s) => ({ path: s.path, contentBase64: toBase64(s.bytes) })),
        }),
      )
    },

    async load() {
      // Duas etapas porque a listagem é só METADADO: trazer os ~15 MB de base64 em toda chamada
      // que só quer contar arquivos é o que a rota `sources` recusa a fazer. O conteúdo vem UM a
      // UM, que é a unidade natural (base64 não se corta ao meio).
      const stored = await remote(() => client.dataset.sources())
      const files: SourceFile[] = []
      // Sequencial, e não `Promise.all`: são megabytes por resposta, e disparar N de uma vez
      // colocaria a pasta inteira em voo — exatamente o que a rota por arquivo evita.
      for (const { path } of stored) {
        const file = await remote(() => client.dataset.sourceContent({ path }))
        // `null` é ESTADO PREVISTO e não falha: listar e buscar são duas requisições, e um
        // arquivo apagado entre uma e outra some daqui em vez de derrubar a exportação inteira.
        if (file) files.push({ path: file.path, bytes: fromBase64(file.contentBase64) })
      }
      return files
    },

    async count() {
      return (await remote(() => client.dataset.sources())).length
    },

    async clear() {
      await remote(() => client.dataset.reset())
    },
  }
}
