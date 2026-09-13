import type { InvestmentHolding, InvestmentSnapshot, PatrimonyPoint, IncomeMonth } from '@wlet/domain'
import { cashAt, contributionsByDate, incomeByMonth, readBrokerageLedger, type BrokerageLedger } from './brokerage'
import type { IngestEnv, SourceFile } from './io'
import { decodeText } from './io'
import { readSheet } from './xlsx'

/**
 * Reconstrói a carteira de investimentos mês a mês, a partir de três fontes.
 *
 * A B3 exporta a POSIÇÃO de hoje e a MOVIMENTAÇÃO histórica, mas não diz a que percentual do
 * CDI cada CDB rende — e sem isso não há como valorar renda fixa numa data passada. O
 * percentual é DERIVADO: resolve-se o `p` que leva o principal aplicado ao valor de hoje
 * usando a série do Banco Central. A conferência é o próprio valor da B3, e os doze títulos
 * da carteira fecham ao centavo.
 *
 * Ações ficam a CUSTO na série. Preço histórico exige uma fonte que peça cadastro, e elas são
 * ~10% da carteira: melhor um piso declarado do que um número inventado.
 *
 * O APORTE não vem daqui nem do banco: vem do extrato da corretora (`./brokerage`), que é a
 * única fonte que enxerga as duas pontas. O extrato bancário sozinho superestimava o aporte
 * em R$ 12.400,00 — resgates que voltaram como TED nominal do titular e não foram
 * reconhecidos como resgate.
 *
 * O que mudou no porte para o navegador: não há diretório para listar nem cache para ler do
 * disco. Os arquivos chegam em `SourceFile[]` — os mesmos de `docs/investimentos/`, com o
 * caminho relativo preservado — e o inflate do xlsx vem no `IngestEnv`, o que torna a função
 * assíncrona. A série do CDI, que no Node saía de `loadCdi()` lendo `docs/investimentos/
 * cdi.json`, sai do MESMO arquivo: ele está entre as fontes, e `readCdiCache` o encontra pelo
 * nome. Quem já tiver a série em mãos pode passá-la por parâmetro.
 */

const MOVEMENT_SHEET = 1
/** Abas de posição: ações, BDR e renda fixa, com a coluna de valor de cada uma. */
const POSITION_SHEETS = [
  { sheet: 1, kind: 'equity' as const, code: 'D', quantity: 'I', value: 'N' },
  { sheet: 2, kind: 'equity' as const, code: 'D', quantity: 'H', value: 'M' },
  { sheet: 3, kind: 'fixed-income' as const, code: 'D', quantity: 'I', value: 'Q' },
]

/** Movimentos que mexem na CUSTÓDIA. O resto — dividendo, JCP, rendimento — é caixa. */
const CUSTODY = new Set(['transferência - liquidação', 'transferência', 'compra', 'venda', 'compra / venda', 'aplicação', 'resgate antecipado/', 'vencimento', 'compra/venda definitiva/cessao'])
const CASH = new Set(['dividendo', 'juros sobre capital próprio', 'rendimento', 'pagamento de juros'])

const FIXED_INCOME_CODE = /\b(CDB[0-9A-Z]{7,}|CLPP\d+|LCI[0-9A-Z]+|LCA[0-9A-Z]+)\b/
const TICKER = /^([A-Z0-9]{4,6})\s*-/

/**
 * Uma linha da série do CDI: dia útil e a taxa daquele dia, já em fração (0.05166% →
 * 0.0005166).
 *
 * O tipo é declarado aqui, e não importado de `@wlet/domain`, porque ele nunca foi vocabulário
 * de domínio da aplicação: a série do CDI é insumo do ingest, some antes de `investments.json`
 * e nenhuma tela a conhece. No Node ele mora em `scripts/cdi.ts`, ao lado do cache.
 */
export interface CdiDay {
  date: string
  rate: number
}

/** O nome do arquivo dentro do caminho — no navegador o `SourceFile` carrega o caminho inteiro. */
function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * O cache do CDI entre as fontes.
 *
 * `docs/investimentos/cdi.json` é gravado por `pnpm cdi` e fica na MESMA pasta dos relatórios
 * da B3, então uma seleção de pasta no navegador já o traz junto. Sem ele a renda fixa não tem
 * série histórica — e a ausência não é erro aqui, é um `problems` mais adiante.
 */
export function readCdiCache(sources: SourceFile[]): CdiDay[] {
  const file = sources.find((f) => basename(f.path).toLowerCase() === 'cdi.json')
  if (!file) return []
  return JSON.parse(decodeText(file.bytes)) as CdiDay[]
}

function toIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br?.trim() ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
function num(value: string | undefined): number | null {
  if (value === undefined || value === '-' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Fator acumulado do CDI entre duas datas, a `pct` do CDI. Ambas exclusiva/inclusiva. */
export function factor(cdi: CdiDay[], from: string, to: string, pct: number): number {
  let f = 1
  for (const day of cdi) {
    if (day.date > from && day.date <= to) f *= 1 + day.rate * pct
  }
  return f
}

/**
 * O que os MESMOS aportes valeriam hoje rendendo 100% do CDI.
 *
 * É o benchmark honesto para esta carteira: ela é quase toda CDB pós-fixado, e a pergunta que
 * o investidor faz não é "subiu?" — é "subiu mais do que se eu tivesse deixado no CDI?".
 * Comparar com Ibovespa diria pouco sobre renda fixa, e comparar com nada não diz nada.
 *
 * O aporte NÃO rende no dia em que chega: o fator do dia é aplicado ao saldo anterior e só
 * depois o dinheiro novo entra. É a convenção de qualquer aplicação — comprar hoje começa a
 * render amanhã — e sem ela o benchmark ganharia um dia de juros de graça a cada aporte.
 *
 * O valor de cada mês é o do ÚLTIMO dia útil dele: a gravação por mês sobrescreve, então
 * sobra a última.
 */
export function benchmarkByMonth(cdi: CdiDay[], contributions: Map<string, number>, until: string): Map<string, number> {
  const dates = [...contributions].sort((a, b) => a[0].localeCompare(b[0]))
  const out = new Map<string, number>()
  if (!dates.length) return out
  const start = dates[0][0]
  let balance = 0
  let i = 0
  for (const day of cdi) {
    if (day.date < start) continue
    if (day.date > until) break
    balance *= 1 + day.rate
    while (i < dates.length && dates[i][0] <= day.date) balance += dates[i++][1]
    out.set(day.date.slice(0, 7), balance)
  }
  // Aporte com data entre o último dia útil do cache do CDI e `until` entra como PRINCIPAL,
  // sem render. O laço acima o descartava: ele existe no `contributed` e sumia do benchmark,
  // o que fazia o desvio contra o CDI parecer melhor do que é. Hoje são zero, mas é uma
  // janela de poucos dias que aparece sempre que o cache do CDI está mais velho que o extrato.
  let pending = 0
  while (i < dates.length && dates[i][0] <= until) pending += dates[i++][1]
  if (pending !== 0) out.set(until.slice(0, 7), balance + pending)
  return out
}

/** O `pct` que leva `base` a `target` entre duas datas. Busca binária: a função é monótona. */
function solvePct(cdi: CdiDay[], base: number, target: number, from: string, to: string): number {
  let lo = 0.3
  let hi = 2.5
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (base * factor(cdi, from, to, mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

interface Movement {
  date: string
  credit: boolean
  type: string
  product: string
  quantity: number | null
  unitPrice: number | null
  value: number | null
}

async function readMovements(file: SourceFile, env: IngestEnv): Promise<Movement[]> {
  const rows = (await readSheet(file, env, MOVEMENT_SHEET)).slice(1)
  const seen = new Set<string>()
  const out: Movement[] = []
  for (const row of rows) {
    // O export da B3 repete linhas idênticas: um título com uma unidade comprada aparecia
    // com duas vendas iguais no mesmo dia. A linha inteira é a chave.
    const key = [row.A, row.B, row.C, row.D, row.F, row.H].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const date = toIso(row.B ?? '')
    if (!date) continue
    out.push({
      date,
      credit: (row.A ?? '').trim() === 'Credito',
      type: (row.C ?? '').trim(),
      product: (row.D ?? '').trim(),
      quantity: num(row.F),
      unitPrice: num(row.G),
      value: num(row.H),
    })
  }
  return out
}

interface Instrument {
  code: string
  kind: 'fixed-income' | 'equity'
  label: string
  issuedAt: string
  unitBase: number
  pct: number
  events: { date: string; quantity: number }[]
}

function heldAt(instrument: Instrument, date: string): number {
  let q = 0
  for (const e of instrument.events) if (e.date <= date) q += e.quantity
  return Math.max(0, q)
}

export interface InvestmentReport {
  snapshot: InvestmentSnapshot
  series: PatrimonyPoint[]
  income: IncomeMonth[]
  ledger: BrokerageLedger | null
  problems: string[]
}

/**
 * Os arquivos são os de `docs/investimentos/`: os dois relatórios da B3 (`posicao*.xlsx` e
 * `movimentacao*.xlsx`), os extratos da corretora (`extrato_de_*.xlsx`) e o cache do CDI.
 * Sem os dois primeiros não há o que reconstruir, e a função devolve `null` — é o mesmo
 * `return null` do original, que ali acontecia quando a pasta não tinha os arquivos.
 */
export async function buildInvestments(sources: SourceFile[], env: IngestEnv, cdiSeries?: CdiDay[]): Promise<InvestmentReport | null> {
  const cdi = cdiSeries ?? readCdiCache(sources)
  const files = sources.filter((f) => basename(f.path).toLowerCase().endsWith('.xlsx'))

  // O MAIS RECENTE, não o primeiro encontrado — e isto é um desvio DELIBERADO do original.
  //
  // Lá a busca era `readdirSync(dir).find(...)`, não recursiva: uma `posicao*.xlsx` guardada
  // numa subpasta era invisível. Aqui a fonte é uma lista de arquivos que o chamador montou, e
  // no navegador `webkitRelativePath` entrega a subárvore INTEIRA de uma seleção de pasta —
  // então `find` passaria a depender da ordem do `FileList` e uma posição antiga poderia
  // vencer. Medido: com uma cópia de 2020 numa subpasta, a série saía VAZIA e o `asOf`
  // retrocedia seis anos, sem erro nenhum.
  //
  // O nome carrega a data (`posicao-AAAA-MM-DD-...`), então ordem lexicográfica é ordem
  // cronológica e o último é o mais novo. Fica determinístico venha a lista na ordem que vier,
  // que é mais do que o original garantia.
  const latest = (prefix: string): SourceFile | undefined =>
    files
      .filter((f) => basename(f.path).toLowerCase().startsWith(prefix))
      .sort((a, b) => {
        const x = basename(a.path)
        const y = basename(b.path)
        return x < y ? -1 : x > y ? 1 : 0
      })
      .at(-1)

  const positionSource = latest('posicao')
  const movementSource = latest('movimentacao')
  if (!positionSource || !movementSource) return null
  const positionFile = basename(positionSource.path)

  const problems: string[] = []
  if (!cdi.length) problems.push('CDI não está em cache — rode `pnpm cdi`. Sem ele a renda fixa não tem série histórica.')

  const ledger = await readBrokerageLedger(sources, env)
  if (!ledger) problems.push('sem extrato da corretora em docs/investimentos/ (`extrato_de_*.xlsx`) — o aporte e o caixa ficam de fora, e o rendimento não fecha.')
  else problems.push(...ledger.problems)
  const contributions = ledger ? contributionsByDate(ledger) : new Map<string, number>()

  const asOf = /(\d{4}-\d{2}-\d{2})/.exec(positionFile)?.[1] ?? cdi.at(-1)?.date ?? new Date().toISOString().slice(0, 10)
  const today = cdi.at(-1)?.date ?? asOf

  // --- posição de hoje, por aba
  const holdings: InvestmentHolding[] = []
  const positionValue = new Map<string, number>()
  const positionQty = new Map<string, number>()
  const issuedAt = new Map<string, string>()
  for (const s of POSITION_SHEETS) {
    const rows = (await readSheet(positionSource, env, s.sheet)).slice(1)
    for (const row of rows) {
      const code = row[s.code]?.trim()
      const quantity = num(row[s.quantity])
      const value = num(row[s.value])
      if (!code || quantity === null || value === null) continue
      positionQty.set(code, quantity)
      positionValue.set(code, value)
      const issue = toIso(row.G ?? '')
      if (issue) issuedAt.set(code, issue)
      holdings.push({ code, kind: s.kind, label: (row.A ?? code).trim(), quantity, value })
    }
  }

  // --- movimentação: eventos de custódia por instrumento
  const movements = await readMovements(movementSource, env)
  const byCode = new Map<string, Movement[]>()
  for (const m of movements) {
    if (CASH.has(m.type.toLowerCase())) continue
    if (!CUSTODY.has(m.type.toLowerCase())) continue
    const code = FIXED_INCOME_CODE.exec(m.product)?.[1] ?? TICKER.exec(m.product)?.[1]
    if (!code) continue
    byCode.set(code, [...(byCode.get(code) ?? []), m])
  }

  const instruments: Instrument[] = []
  for (const [code, list] of byCode) {
    const buys = list.filter((m) => m.credit && m.quantity).sort((a, b) => a.date.localeCompare(b.date))
    if (!buys.length) continue
    const first = buys[0]
    const unitBase = first.value && first.quantity ? first.value / first.quantity : (first.unitPrice ?? 0)
    const issue = issuedAt.get(code) ?? first.date
    const events = list.filter((m) => m.quantity !== null).map((m) => ({ date: m.date, quantity: m.credit ? m.quantity! : -m.quantity! }))
    const equity = !FIXED_INCOME_CODE.test(first.product)

    let pct = 1
    if (!equity && cdi.length && unitBase > 0) {
      const target = positionValue.get(code)
      if (target !== undefined) {
        pct = solvePct(cdi, (positionQty.get(code) ?? 0) * unitBase, target, issue, today)
        const check = (positionQty.get(code) ?? 0) * unitBase * factor(cdi, issue, today, pct)
        if (Math.abs(check - target) > 0.02) problems.push(`${code}: o %CDI derivado não reproduz a posição (${check.toFixed(2)} contra ${target.toFixed(2)})`)
      } else {
        // Título já extinto: o percentual sai do valor de saída, não da posição.
        const exit = list
          .filter((m) => !m.credit && m.value && m.quantity)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1)
        if (exit) pct = solvePct(cdi, exit.quantity! * unitBase, exit.value!, issue, exit.date)
      }
    }
    instruments.push({ code, kind: equity ? 'equity' : 'fixed-income', label: first.product, issuedAt: issue, unitBase, pct, events })
  }

  const valueAt = (date: string) => {
    let fixed = 0
    let equity = 0
    for (const it of instruments) {
      const q = heldAt(it, date)
      if (q <= 0) continue
      if (it.kind === 'fixed-income') fixed += cdi.length ? q * it.unitBase * factor(cdi, it.issuedAt, date < today ? date : today, it.pct) : q * it.unitBase
      else equity += q * it.unitBase
    }
    return { fixed, equity }
  }

  // --- série mensal, do primeiro movimento até a data da posição
  //
  // O começo é o mais antigo entre o primeiro papel e o primeiro movimento de caixa: um
  // aporte anterior à primeira compra é aporte igual, e começar pelo papel o descartaria em
  // silêncio. O acumulado de aporte e caixa é sempre `<= fim do mês`, então nada se perde
  // mesmo que a série comece depois — mas aí o primeiro ponto já nasceria com degrau.
  const benchmark = benchmarkByMonth(cdi, contributions, asOf)
  const firstMonth = [...instruments.map((i) => i.issuedAt), ...(ledger?.entries.map((e) => e.date) ?? [])].sort()[0]?.slice(0, 7)
  const series: PatrimonyPoint[] = []
  if (firstMonth) {
    let [y, m] = firstMonth.split('-').map(Number)
    const [ly, lm] = asOf.split('-').map(Number)
    let lastBenchmark = 0
    while (y < ly || (y === ly && m <= lm)) {
      const month = `${y}-${String(m).padStart(2, '0')}`
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      const upTo = end > asOf ? asOf : end
      let contributed = 0
      for (const [date, amount] of contributions) if (date <= upTo) contributed += amount
      const { fixed, equity } = valueAt(upTo)
      // No ÚLTIMO mês vale a posição real da B3, não a reconstrução: é a única data em que o
      // preço de mercado das ações é conhecido. Sem isto a tela mostraria "carteira 48.200,00"
      // ao lado de um rendimento calculado sobre 47.410,00, e os dois não fechariam entre si.
      const isLast = month === asOf.slice(0, 7)
      const fixedValue = isLast ? holdings.filter((h) => h.kind === 'fixed-income').reduce((s, h) => s + h.value, 0) : fixed
      const equityValue = isLast ? holdings.filter((h) => h.kind === 'equity').reduce((s, h) => s + h.value, 0) : equity
      const cash = ledger ? cashAt(ledger, upTo) : 0
      // Mês sem dia útil no cache do CDI herda o último conhecido — não zera.
      lastBenchmark = benchmark.get(month) ?? lastBenchmark
      series.push({
        month,
        contributed: Math.round(contributed * 100) / 100,
        fixedIncome: Math.round(fixedValue * 100) / 100,
        equity: Math.round(equityValue * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        total: Math.round((fixedValue + equityValue + cash) * 100) / 100,
        benchmark: Math.round(lastBenchmark * 100) / 100,
      })
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }

  // A série começa de onde a carteira nunca mais ficou vazia.
  //
  // Não basta cortar os zeros do INÍCIO: o primeiro mês do razão tem movimento (em 2022
  // entrou dinheiro, virou uma NTN-F e voltou inteiro no mesmo mês), e os onze meses de zero
  // vêm DEPOIS dele. Cortar só o começo não removia nada.
  //
  // Esses meses não são evolução, são o vazio antes dela — e custam caro no desenho: o aporte
  // acumulado fica em −R$ 18,40 (você resgatou mais do que aplicou, porque rendeu) e o eixo Y
  // abre uma faixa negativa inteira de −R$ 25 mil para acomodar vinte e dois reais.
  //
  // Nada se perde: `contributed` e `cash` são acumulados desde sempre, então o primeiro mês
  // que fica já carrega tudo o que aconteceu antes dele.
  const lastEmpty = series.findLastIndex((p) => p.total === 0)
  if (lastEmpty >= 0 && lastEmpty < series.length - 1) series.splice(0, lastEmpty + 1)

  const snapshot: InvestmentSnapshot = {
    asOf,
    source: positionFile,
    holdings: holdings.sort((a, b) => b.value - a.value),
    total: Math.round(holdings.reduce((s, h) => s + h.value, 0) * 100) / 100,
    cash: ledger?.cash ?? 0,
    equityAtCost: true,
  }
  return { snapshot, series, income: ledger ? incomeByMonth(ledger) : [], ledger, problems }
}
