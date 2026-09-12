import type { Dataset } from '@wlet/domain'
import { toBase64 } from '@wlet/lib/portable'
import type { SourceFile } from '@wlet/ingest/io'
import type { Declarations } from '@wlet/ingest/pipeline'
import type { RemoteDeps } from '../../shared/infrastructure/orpc'
import type { DatasetRepository } from '../domain/ports/dataset-repository'
import type { IngestRunner } from '../domain/ports/ingest-runner'
import type { SourceStore } from '../domain/ports/source-store'

/**
 * O conjunto, no servidor.
 *
 * `save` e `clear` existem na porta porque o adapter de IndexedDB precisa deles — lá o
 * navegador é quem grava o que o worker produziu. Aqui a gravação é CONSEQUÊNCIA da ingestão,
 * que já aconteceu do outro lado, então `save` não tem o que fazer. Ele não lança: a porta
 * descreve uma capacidade que este adapter satisfaz de outro jeito, e um erro aqui quebraria
 * um serviço que está funcionando como deve.
 */
export function makeOrpcDatasetRepository({ client }: RemoteDeps): DatasetRepository {
  return {
    async find() {
      return (await client.dataset.get()) as Dataset | null
    },
    async save() {
      // Publicado pelo próprio servidor no fim da ingestão — ver `IngestRunner` abaixo.
    },
    async clear() {
      await client.dataset.reset()
    },
  }
}

/**
 * A ingestão, no servidor.
 *
 * O contraste com o adapter de Web Worker é o ponto: lá o pipeline roda no navegador e o
 * resultado volta para ser gravado; aqui os ARQUIVOS sobem e voltam o conjunto já publicado. O
 * `IngestRunner` é a mesma porta nos dois casos, e é por isso que o serviço não sabe a
 * diferença.
 *
 * O `config` que o serviço passa é IGNORADO de propósito: quem manda é a configuração gravada no
 * servidor, e ela já está lá. Aceitar a do cliente abriria a porta para o pipeline rodar com uma
 * configuração que o `GET /config` não confirma — dois estados para a mesma pergunta.
 */
export function makeOrpcIngestRunner({ client }: RemoteDeps): IngestRunner {
  return {
    async run(sources: SourceFile[], _config: Declarations, _now: string) {
      const { dataset, report } = await client.dataset.ingest({
        // `toBase64` e não `btoa(String.fromCharCode(...bytes))`: o spread de um Uint8Array de
        // megabytes estoura a pilha de argumentos ANTES de qualquer rede, com um `RangeError` que
        // não fala em tamanho. O helper converte em fatias de 32 KB, e o docblock dele em
        // `@wlet/lib/portable` já registrava essa lição — este adapter é que a reimplementou
        // quebrada. Os 11,4 MB de extratos reais que `backup.ts` documenta nunca passavam daqui.
        sources: sources.map((s) => ({ path: s.path, contentBase64: toBase64(s.bytes) })),
      })
      return { ...(dataset as unknown as Record<string, unknown>), report } as never
    },
  }
}

/**
 * Os arquivos-fonte, no servidor.
 *
 * `save` é vazio pela mesma razão do repositório: o `POST /dataset/ingest` já os guarda, numa
 * transação, ANTES de rodar. Guardá-los de novo daqui seria uma segunda cópia do mesmo dado —
 * e, pior, uma que poderia divergir.
 */
export function makeOrpcSourceStore({ client }: RemoteDeps): SourceStore {
  return {
    async save() {
      // Guardados pelo servidor, dentro da mesma transação da ingestão.
    },
    async load() {
      // O servidor não devolve o CONTEÚDO dos arquivos: eles existem lá para reprocessar, e
      // trazê-los de volta seria mover megabytes para nada. Quem quer reprocessar chama
      // `reingest`; quem quer exportar chama o pacote.
      return []
    },
    async count() {
      return (await client.dataset.sources()).length
    },
    async clear() {
      await client.dataset.reset()
    },
  }
}
