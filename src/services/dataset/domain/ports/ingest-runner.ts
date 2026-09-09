import type { SourceFile } from '@/lib/ingest/io'
import type { IngestConfig, IngestResult } from '@/lib/ingest/pipeline'

/**
 * Quem executa o pipeline. É porta porque o ONDE muda: worker no navegador, mesma thread num
 * teste, e um dia talvez algo mais. O serviço não precisa saber — ele precisa do resultado.
 */
export interface IngestRunner {
  run(sources: SourceFile[], config: IngestConfig, now: string): Promise<IngestResult>
}
