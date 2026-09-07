import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * O CACHE do CDI diário — leitura pura, sem rede.
 *
 * Este arquivo é MÓDULO, não script: quem baixa é `fetch-cdi.ts`, e a separação não é
 * organização, é correção. Enquanto o `main()` vivia aqui, `scripts/investments.ts` importava
 * `loadCdi` daqui e o import EXECUTAVA o download — então `pnpm ingest` batia no Banco Central
 * a cada rodada, e o `process.exit(1)` do erro matava a ingestão inteira quando não havia
 * rede. Era o oposto exato do que o comando promete ser: offline e determinístico.
 *
 * O cache fica em `docs/`, junto dos outros dados de entrada e igualmente fora do git.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
export const CDI_CACHE = join(HERE, '..', 'docs', 'investimentos', 'cdi.json')

/** Uma linha da série: dia útil e a taxa daquele dia, já em fração (0.05166% → 0.0005166). */
export interface CdiDay {
  date: string
  rate: number
}

export function loadCdi(): CdiDay[] {
  if (!existsSync(CDI_CACHE)) return []
  return JSON.parse(readFileSync(CDI_CACHE, 'utf8')) as CdiDay[]
}
