import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Onde o cache do CDI diário fica no disco — e só isso.
 *
 * Este arquivo é MÓDULO, não script: quem baixa é `fetch-cdi.ts`, e a separação não é
 * organização, é correção. Enquanto o `main()` vivia aqui, o módulo de investimentos importava
 * `loadCdi` daqui e o import EXECUTAVA o download — então `pnpm ingest` batia no Banco Central
 * a cada rodada, e o `process.exit(1)` do erro matava a ingestão inteira quando não havia rede.
 * Era o oposto exato do que o comando promete ser: offline e determinístico.
 *
 * **A LEITURA saiu daqui.** Ela vive em `readCdiCache`, no núcleo do ingest, que encontra o
 * `cdi.json` entre as fontes que recebeu em vez de abrir um caminho fixo — é o que permite o
 * mesmo código rodar no navegador, onde não há caminho nenhum. `CdiDay` é reexportado do
 * núcleo em vez de redeclarado: duas declarações do mesmo registro divergiriam no primeiro
 * campo novo.
 *
 * O cache fica em `docs/`, junto dos outros dados de entrada e igualmente fora do git.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
export const CDI_CACHE = join(HERE, '..', 'docs', 'investimentos', 'cdi.json')

export type { CdiDay } from '../src/lib/ingest/investments.ts'
