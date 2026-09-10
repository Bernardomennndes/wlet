import { oc } from '@orpc/contract'
import { z } from 'zod'
import { dataset, ingestReport, sourceFileUpload, storedSource } from './shape'

/**
 * O conjunto ingerido.
 *
 * `GET /dataset` é a leitura que o boot faz. As outras três são escrita, e a diferença entre
 * `ingest` e `reingest` é o que a arquitetura já documentava: perfil de conta e regra de
 * categoria agem durante a LEITURA do arquivo, então mudá-las não altera nada sem o arquivo
 * passar de novo pelo pipeline — e os arquivos ficam guardados justamente para isso.
 */
export const datasetRoutes = {
  get: oc.route({ method: 'GET', path: '/dataset' }).output(dataset.nullable()),

  ingest: oc
    .route({ method: 'POST', path: '/dataset/ingest' })
    .input(z.object({ sources: z.array(sourceFileUpload) }))
    .output(z.object({ dataset, report: ingestReport })),

  /** Reprocessa o que já está guardado, com a configuração de agora. */
  reingest: oc.route({ method: 'POST', path: '/dataset/reingest' }).output(z.object({ dataset, report: ingestReport })),

  reset: oc.route({ method: 'DELETE', path: '/dataset' }).output(z.object({ ok: z.literal(true) })),

  sources: oc.route({ method: 'GET', path: '/dataset/sources' }).output(z.array(storedSource)),
}
