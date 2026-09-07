import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CDI_CACHE, type CdiDay } from './cdi.ts'

/**
 * Baixa o CDI diário do Banco Central e grava o cache que `cdi.ts` lê. `pnpm cdi`.
 *
 * É comando SEPARADO do `pnpm ingest` de propósito: o ingest é offline e determinístico —
 * roda num avião e dá o mesmo resultado —, e amarrá-lo a uma API o faria falhar sem rede por
 * um dado que muda uma vez por dia. Por isso o `main()` mora AQUI e não no módulo: importar
 * o módulo não pode disparar rede.
 *
 * Série 12 do SGS: taxa do CDI ao dia, em porcentagem. É API pública, sem chave.
 */

function toIso(br: string): string {
  const [d, m, y] = br.split('/')
  return `${y}-${m}-${d}`
}

/** O SGS recusa janela maior que dez anos com 406, então a busca vai em fatias. */
const WINDOW_YEARS = 5

function brDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

async function fetchWindow(from: Date, to: Date): Promise<{ data: string; valor: string }[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${brDate(from)}&dataFinal=${brDate(to)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Banco Central respondeu ${response.status} para ${brDate(from)}–${brDate(to)}`)
  return (await response.json()) as { data: string; valor: string }[]
}

async function main() {
  const START_YEAR = 2015
  const today = new Date()
  console.log(`Buscando CDI diário no Banco Central (${START_YEAR} a ${today.getFullYear()})…`)

  const rows: { data: string; valor: string }[] = []
  for (let year = START_YEAR; year <= today.getFullYear(); year += WINDOW_YEARS) {
    const from = new Date(year, 0, 1)
    const last = new Date(Math.min(new Date(year + WINDOW_YEARS - 1, 11, 31).getTime(), today.getTime()))
    rows.push(...(await fetchWindow(from, last)))
  }

  // Fatias podem se sobrepor na virada; a data é a chave.
  const byDate = new Map<string, number>()
  for (const row of rows) byDate.set(toIso(row.data), Number(row.valor) / 100)
  const series: CdiDay[] = [...byDate].map(([date, rate]) => ({ date, rate })).sort((a, b) => a.date.localeCompare(b.date))

  mkdirSync(dirname(CDI_CACHE), { recursive: true })
  writeFileSync(CDI_CACHE, JSON.stringify(series, null, 0))

  const factor = series.reduce((acc, day) => acc * (1 + day.rate), 1)
  console.log(`  ${series.length} dias úteis, de ${series[0].date} a ${series.at(-1)!.date}`)
  console.log(`  fator acumulado no período: ${factor.toFixed(6)} (${((factor - 1) * 100).toFixed(2)}%)`)
  console.log(`  gravado em ${CDI_CACHE}`)
}

main().catch((error) => {
  console.error('Falha ao buscar o CDI:', error instanceof Error ? error.message : error)
  process.exit(1)
})
