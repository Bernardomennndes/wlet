import type { Dataset } from '@/lib/dataset'

/** De onde o conjunto ingerido é lido e onde ele é gravado. */
export interface DatasetRepository {
  find(): Promise<Dataset | null>
  save(data: Dataset): Promise<void>
  clear(): Promise<void>
}

/**
 * A cópia que veio no aplicativo — quando veio.
 *
 * Devolve `null` quando não veio, e isso é ESTADO PREVISTO, não falha. Ela é lida de
 * `src/generated/`, que é escrito por `pnpm ingest` e não é versionado: um clone recém-feito,
 * ou um build de quem nunca rodou o ingest, simplesmente não a tem. Prometer um conjunto aqui
 * obrigava o build a ter os arquivos, o que contradizia o app — os dados vêm do navegador.
 *
 * Quem monta o serviço decide o que fazer com a ausência; hoje ela abre um conjunto vazio.
 */
export interface DatasetSeed {
  read(): Promise<Dataset | null>
}
