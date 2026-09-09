import { browserEnv, type SourceFile } from './io'
import { runIngest, type Declarations, type IngestResult } from './pipeline'

/**
 * O ingest fora da thread principal.
 *
 * Não é otimização prematura: são milhares de lançamentos, descompressão de ZIP e de PDF, e
 * um casamento que percorre a lista várias vezes. Na thread principal isso congela a interface
 * inteira — sem spinner que valha, porque o próprio spinner para de animar. No worker, a tela
 * continua respondendo e pode mostrar progresso de verdade.
 *
 * O `postMessage` transfere os BUFFERS dos arquivos em vez de copiá-los: um punhado de PDFs e
 * planilhas passa de dezenas de MB, e a cópia dobraria o pico de memória à toa.
 */
export interface IngestRequest {
  sources: SourceFile[]
  config: Declarations
  now: string
}

export type IngestResponse = { ok: true; result: IngestResult } | { ok: false; error: string }

self.onmessage = async (event: MessageEvent<IngestRequest>) => {
  try {
    const { sources, config, now } = event.data
    const result = await runIngest({ ...config, sources, now, env: browserEnv })
    const response: IngestResponse = { ok: true, result }
    self.postMessage(response)
  } catch (cause) {
    // O erro NÃO atravessa como objeto: `Error` não sobrevive ao structured clone com a pilha
    // intacta em todo navegador, e o que interessa do outro lado é a mensagem.
    const response: IngestResponse = { ok: false, error: cause instanceof Error ? (cause.stack ?? cause.message) : String(cause) }
    self.postMessage(response)
  }
}
