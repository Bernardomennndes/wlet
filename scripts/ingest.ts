/**
 * `pnpm ingest` — a casca de Node sobre o núcleo compartilhado.
 *
 * O pipeline inteiro mora em `src/lib/ingest/pipeline.ts` e roda igual nos dois ambientes.
 * O que sobrou aqui é o que só existe no Node: ler `docs/` do disco, importar os
 * `*.config.ts` locais, gravar os JSON e imprimir o relatório no terminal.
 *
 * A separação não é organização: sem ela existiriam duas implementações do mesmo casamento e
 * da mesma categorização — uma para o terminal e outra para o navegador —, e elas divergiriam
 * no primeiro ajuste. É o argumento que o projeto já aplica a `settlement.ts`.
 *
 * Uso: `pnpm ingest`
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { runIngest, type AccountProfile } from '../src/lib/ingest/pipeline.ts'
import type { SourceFile } from '../src/lib/ingest/io.ts'
import { buildRules } from '../src/lib/ingest/rules.ts'
import { ACCOUNT_PROFILES, SELF_NAME_PATTERNS } from './accounts.config.ts'
import { BUDGET } from './budget.config.ts'
import { GOALS } from './goals.config.ts'
import { nodeEnv } from './ingest-env.ts'
import { PLANNED_ENTRIES } from './planned.config.ts'
import { RECEIVABLES } from './receivables.config.ts'
import { CUSTOM_RULES } from './rules.config.ts'
import { TRIPS, TRIP_EXCLUDED_CATEGORIES } from './trips.config.ts'

const ROOT = new URL('..', import.meta.url).pathname
const DOCS_DIR = join(ROOT, 'docs')
const OUT_DIR = join(ROOT, 'src', 'generated')

/** Todo arquivo de `docs/`, com o caminho RELATIVO à raiz — é ele que o núcleo usa como identidade. */
function collect(dir: string): SourceFile[] {
  const out: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collect(full))
    else out.push({ path: relative(ROOT, full), bytes: new Uint8Array(readFileSync(full)) })
  }
  return out
}

async function main() {
  if (!existsSync(DOCS_DIR)) {
    console.log('Não há docs/ para ler. Coloque extratos e faturas lá e rode de novo.')
    return
  }

  const result = await runIngest({
    sources: collect(DOCS_DIR),
    accounts: ACCOUNT_PROFILES as AccountProfile[],
    selfNamePatterns: SELF_NAME_PATTERNS,
    rules: buildRules(CUSTOM_RULES),
    planned: PLANNED_ENTRIES,
    receivables: RECEIVABLES,
    budget: BUDGET,
    goals: GOALS,
    trips: TRIPS,
    tripExcludedCategories: TRIP_EXCLUDED_CATEGORIES,
    now: new Date().toISOString(),
    env: nodeEnv,
  })

  mkdirSync(OUT_DIR, { recursive: true })
  const write = (name: string, value: unknown) => writeFileSync(join(OUT_DIR, name), JSON.stringify(value, null, 2))
  write('accounts.json', result.accounts)
  write('transactions.json', result.transactions)
  write('transfers.json', result.transfers)
  write('meta.json', result.meta)
  write('planned.json', result.planned)
  write('goals.json', result.goals)
  write('budget.json', result.budget)
  write('receivables.json', result.receivables)
  write('trips.json', result.trips)
  write('investments.json', result.investments)

  // ---- Relatório
  const r = result.report
  for (const id of r.unknownAccounts) console.warn(`⚠️  Conta não cadastrada, criada automaticamente: ${id}`)
  console.log(`Arquivos lidos: ${r.filesRead} (ignorados como duplicados: ${r.skipped.length})`)
  if (r.duplicated.length) {
    const total = r.duplicated.reduce((s, d) => s + d.count, 0)
    console.log(`Lançamentos repetidos descartados: ${total} (períodos sobrepostos entre arquivos)`)
    for (const { accountId, count } of r.duplicated) console.log(`  · ${accountId.padEnd(38)} ${count}`)
  }
  for (const s of r.skipped) console.log(`  · duplicado: ${s}`)
  if (r.pdfProblems.length) {
    console.log(`Faturas em PDF recusadas (a soma não fecha com o total impresso): ${r.pdfProblems.length}`)
    for (const p of r.pdfProblems) console.log(`  ⚠️  ${p}`)
  }
  console.log(`Contas: ${result.accounts.length}`)
  for (const a of result.accounts) console.log(`  · ${a.id.padEnd(18)} ${String(a.transactionCount).padStart(4)} transações  ${a.coverage ? `${a.coverage.from} → ${a.coverage.to}` : '(virtual)'}`)
  console.log(`Transações: ${result.transactions.length}  |  Transferências: ${result.transfers.length}`)
  if (r.unmatchedTransfers.length) {
    console.log(`Transferências sem contraparte: ${r.unmatchedTransfers.length}`)
    for (const t of r.unmatchedTransfers) console.log(`  · ${t.date} ${t.accountId.padEnd(14)} ${t.amount.toFixed(2).padStart(10)}  ${t.description}`)
  }
  if (r.uncategorized.length) {
    console.log(`Sem categoria específica: ${r.uncategorized.length}`)
    for (const t of r.uncategorized) console.log(`  · ${t.date} ${t.accountId.padEnd(14)} ${t.amount.toFixed(2).padStart(10)}  ${t.description}`)
  }
  for (const [titulo, lista] of [
    ['Problemas nas regras de previsão', r.plannedProblems],
    ['Problemas nas cobranças', r.receivableProblems],
    ['Problemas nas metas', r.goalProblems],
    ['Problemas no razão da corretora', r.brokerageProblems],
    ['Problemas nos investimentos', r.investmentProblems],
  ] as const) {
    if (!lista.length) continue
    console.log(`${titulo}: ${lista.length}`)
    for (const p of lista) console.log(`  ⚠️  ${p}`)
  }
}

await main()
