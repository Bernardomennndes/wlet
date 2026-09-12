/**
 * `pnpm package` — gera o pacote que o navegador importa.
 *
 * Existe porque o `pnpm ingest` grava `src/generated/*.json`, e esses arquivos só alcançam uma
 * instalação VAZIA: assim que o servidor tem conjunto, ele é a fonte e o build não chega mais
 * nele. Este comando fecha esse caminho — roda o mesmo pipeline e escreve um arquivo que a
 * tela "Meus dados" importa, e a importação escreve no servidor.
 *
 * É comando SEPARADO do ingest pela mesma razão que `fetch-cdi.ts` é separado de `cdi.ts`: o
 * ingest faz uma coisa (regenerar os JSON) e amarrá-lo a outra o obrigaria a escrever 18 MB a
 * cada rodada.
 *
 * O pacote leva o conjunto, as declarações e os arquivos originais. NÃO leva planos, ajustes de
 * categoria nem preferências — esses nascem de dentro do app, e um pacote gerado no terminal
 * não teria o que dizer sobre eles. A importação mostra só as partes que o arquivo tem.
 *
 * Uso: `pnpm package [saida.json]`
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toBase64, toJson } from '@wlet/lib/portable'
import { runIngest, type AccountProfile } from '@wlet/ingest/pipeline'
import { buildRules } from '@wlet/ingest/rules'
import { ACCOUNT_PROFILES, SELF_NAME_PATTERNS } from './accounts.config.ts'
import { BUDGET } from './budget.config.ts'
import { collect } from './collect.ts'
import { GOALS } from './goals.config.ts'
import { nodeEnv } from '@wlet/ingest/node-env'
import { PLANNED_ENTRIES } from './planned.config.ts'
import { RECEIVABLES } from './receivables.config.ts'
import { CUSTOM_RULES } from './rules.config.ts'

const ROOT = new URL('..', import.meta.url).pathname
const DOCS_DIR = join(ROOT, 'docs')

async function main() {
  if (!existsSync(DOCS_DIR)) {
    console.log('Não há docs/ para ler. Coloque extratos e faturas lá e rode de novo.')
    return
  }

  const sources = collect(DOCS_DIR, ROOT)
  const declarations = {
    accounts: ACCOUNT_PROFILES as AccountProfile[],
    selfNamePatterns: SELF_NAME_PATTERNS,
    rules: buildRules(CUSTOM_RULES),
    planned: PLANNED_ENTRIES.map((e) => ({ ...e, exceptions: e.exceptions ?? {} })),
    receivables: RECEIVABLES,
    budget: BUDGET,
    goals: GOALS,
  }

  const result = await runIngest({ ...declarations, sources, now: new Date().toISOString(), env: nodeEnv })

  const out = process.argv[2] ?? join(ROOT, `wlet-${new Date().toISOString().slice(0, 10)}.json`)
  const json = toJson(
    {
      dataset: { accounts: result.accounts, meta: result.meta, transactions: result.transactions, transfers: result.transfers, investments: result.investments },
      declarations,
      sources: sources.map((s) => ({ path: s.path, base64: toBase64(s.bytes) })),
    },
    true,
  )
  writeFileSync(out, json)

  const mb = (json.length / 1_048_576).toFixed(1)
  console.log(`Pacote escrito em ${out} (${mb} MB)`)
  console.log(`  ${result.transactions.length} lançamentos · ${result.accounts.length} contas · ${sources.length} arquivos originais`)
  console.log(`  ${declarations.planned.length} previstos · ${declarations.receivables.length} cobranças · ${declarations.goals.length} metas · ${declarations.rules.length} regras`)
  console.log('\nO arquivo tem TODOS os seus lançamentos e os extratos originais. Importe em "Meus dados".')
  if (result.report.pdfProblems.length) console.log(`\n⚠️  ${result.report.pdfProblems.length} fatura(s) em PDF recusadas — o pacote não as inclui.`)
}

await main()
