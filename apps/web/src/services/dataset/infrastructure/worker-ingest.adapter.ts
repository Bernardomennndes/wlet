import type { SourceFile } from '@wlet/ingest/io'
import type { Declarations, IngestResult } from '@wlet/ingest/pipeline'
import type { IngestResponse } from './ingest.worker'
import { DomainError } from '@/services/shared/domain/errors'
import type { IngestRunner } from '../domain/ports/ingest-runner'

/** A leitura dos seus arquivos falhou — e a mensagem vem do pipeline, que sabe o motivo. */
export class IngestFailedError extends DomainError {
  constructor(detail: string) {
    super(`Não foi possível ler os arquivos: ${detail}`)
  }
}

/**
 * Executa o pipeline num Web Worker.
 *
 * O worker é criado por CHAMADA e encerrado no fim. Manter um vivo economizaria a partida —
 * poucos milissegundos — e custaria a memória dos buffers presa entre uma ingestão e outra,
 * que é a grandeza que de fato importa aqui.
 *
 * `new URL(..., import.meta.url)` é a forma que o Vite reconhece para empacotar o worker; uma
 * string literal viraria um caminho que não existe no build.
 */
export function makeWorkerIngestRunner(): IngestRunner {
  return {
    run(sources: SourceFile[], config: Declarations, now: string): Promise<IngestResult> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<IngestResponse>) => {
          worker.terminate()
          if (event.data.ok) resolve(event.data.result)
          else reject(new IngestFailedError(event.data.error))
        }
        worker.onerror = (event) => {
          worker.terminate()
          reject(new IngestFailedError(event.message || 'o processamento falhou'))
        }
        // Os buffers vão TRANSFERIDOS: depois desta linha eles não são mais legíveis aqui, o
        // que é seguro porque quem chamou acabou de lê-los do disco e não os reusa.
        worker.postMessage(
          { sources, config, now },
          sources.map((s) => s.bytes.buffer),
        )
      })
    },
  }
}

/** Executa na MESMA thread. Para teste, e para um ambiente sem Worker. */
export function makeInlineIngestRunner(): IngestRunner {
  return {
    async run(sources, config, now) {
      const [{ runIngest }, { browserEnv }] = await Promise.all([import('@wlet/ingest/pipeline'), import('@wlet/ingest/io')])
      return runIngest({ ...config, sources, now, env: browserEnv })
    },
  }
}
