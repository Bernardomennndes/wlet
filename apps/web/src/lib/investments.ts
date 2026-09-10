import { dataset } from './dataset'
import type { IncomeMonth, InvestmentSnapshot, PatrimonyPoint } from '@wlet/domain'

export type { InvestmentHolding, InvestmentSnapshot, IncomeMonth, PatrimonyPoint } from '@wlet/domain'

/**
 * A carteira reconstruída pelo `pnpm ingest` a partir dos relatórios da B3, do extrato da
 * corretora e do CDI.
 *
 * `snapshot` é `null` quando não há relatório em `docs/investimentos/` — um clone novo, por
 * exemplo. Toda tela que usa isto precisa desenhar a ausência, não um zero.
 */
const data = dataset().investments

export const INVESTMENTS: InvestmentSnapshot | null = data.snapshot
export const PATRIMONY: PatrimonyPoint[] = data.series
export const INCOME: IncomeMonth[] = data.income

/**
 * Rendimento acumulado: o patrimônio menos o aporte líquido.
 *
 * `total` já inclui o caixa da corretora, e `contributed` já desconta o que voltou para o
 * banco — as duas coisas que faltavam quando este número aparecia negativo.
 */
export function yieldOf(point: PatrimonyPoint): number {
  return Math.round((point.total - point.contributed) * 100) / 100
}

/**
 * As janelas de tempo do gráfico-herói.
 *
 * Só existem janelas que a série sustenta. A referência oferecia 1D e 1S; aqui a série é
 * MENSAL — um seletor de um dia sobre pontos mensais devolveria um ponto só, e um gráfico de
 * um ponto é uma mentira com eixo. Três meses é o mínimo em que a linha ainda tem forma.
 */
export const PATRIMONY_RANGES = [
  { value: '3m', label: '3M', months: 3 },
  { value: '6m', label: '6M', months: 6 },
  { value: '12m', label: '1A', months: 12 },
  { value: 'all', label: 'Tudo', months: Number.POSITIVE_INFINITY },
] as const

export type PatrimonyRange = (typeof PATRIMONY_RANGES)[number]['value']

/**
 * As duas evoluções de uma janela, e o aporte que as separa.
 *
 * Existe porque a distância entre BRUTA e RELATIVA é a informação: a bruta mede o patrimônio
 * e inclui o dinheiro que entrou no período (numa janela de 12 meses isso deu +122%, quase
 * tudo aporte); a relativa desconta esse aporte e sobra o que a carteira rendeu.
 *
 * A conta mora aqui e não no componente porque ela já estava escrita inline em três lugares —
 * o herói, o cartão de CDI e o tooltip —, com um helper equivalente ao lado, sem uso. Três
 * cópias de uma subtração divergem no primeiro ajuste.
 *
 * Os campos percentuais vêm `null` quando não há base para dividir, e aí a pílula não é
 * desenhada: um "0,0%" ali seria afirmação, não ausência.
 */
export interface WindowChange {
  /** Variação do patrimônio, em reais e em fração — inclui o aporte do período. */
  grossAmount: number | null
  grossChange: number | null
  /** Só o que rendeu: a variação menos o aporte do período. */
  gain: number | null
  netChange: number | null
  /** Quanto entrou de dinheiro novo na janela. */
  contributed: number | null
}

export function windowChange(points: PatrimonyPoint[]): WindowChange {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return { grossAmount: null, grossChange: null, gain: null, netChange: null, contributed: null }
  const grossAmount = last.total - first.total
  const contributed = last.contributed - first.contributed
  const gain = grossAmount - contributed
  const base = first.total > 0 ? first.total : null
  return {
    grossAmount,
    grossChange: base === null ? null : grossAmount / base,
    gain,
    netChange: base === null ? null : gain / base,
    contributed,
  }
}

/**
 * O desvio contra o CDI: quanto a carteira está acima ou abaixo do que os MESMOS aportes
 * teriam rendido no CDI cheio.
 *
 * É razão entre os dois valores, não diferença entre rentabilidades: as duas séries recebem
 * o mesmo dinheiro nas mesmas datas, então dividir uma pela outra já neutraliza o efeito do
 * momento de cada aporte — que é justamente o que torna comparar rentabilidade de carteira
 * com aporte irregular tão enganoso.
 */
export function benchmarkGap(point: PatrimonyPoint): number | null {
  if (point.benchmark <= 0) return null
  return point.total / point.benchmark - 1
}

export interface AssetClass {
  id: 'fixed-income' | 'equity' | 'cash'
  label: string
  value: number
  /** Fatia do patrimônio, de 0 a 1. */
  share: number
}

/**
 * As classes de ativo, para os tiles e para o treemap.
 *
 * O CAIXA entra como classe. Ele não é papel, mas é patrimônio, e uma alocação que soma 100%
 * sem ele estaria dividindo um bolo menor que o número exibido logo acima.
 */
export function assetClasses(snapshot: InvestmentSnapshot): AssetClass[] {
  const fixed = snapshot.holdings.filter((h) => h.kind === 'fixed-income').reduce((s, h) => s + h.value, 0)
  const equity = snapshot.holdings.filter((h) => h.kind === 'equity').reduce((s, h) => s + h.value, 0)
  const total = fixed + equity + snapshot.cash
  const share = (v: number) => (total > 0 ? v / total : 0)
  return [
    { id: 'fixed-income', label: 'Renda fixa', value: fixed, share: share(fixed) },
    { id: 'equity', label: 'Ações e BDR', value: equity, share: share(equity) },
    { id: 'cash', label: 'Caixa', value: snapshot.cash, share: share(snapshot.cash) },
  ]
}
