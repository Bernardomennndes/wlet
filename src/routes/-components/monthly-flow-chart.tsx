import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS } from '@/components/charts/chart-theme'
import { EXPENSE_HATCH_SWATCH, expenseHatch, type LegendMark, MONEY_AXIS, MONEY_GRID, MONTH_AXIS, PROJECTION_DASH } from '@/components/charts/money-bar'
import { ChartHeader, MarkSwatch } from '@/components/charts/money-bar-chart'
import { PROJECTION_MARKER_SPACE, ProjectionDivider } from '@/components/charts/projection-divider'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { EXPENSE_VAR, INCOME_VAR } from '@/lib/chart-tokens'
import { type Flow, flowKinds, type MonthSummary } from '@/lib/finance'
import { formatBRL, formatMonthLongLabel, formatPercent } from '@/lib/format'

/** O rótulo do enum vem da lista de domínio — o gráfico não redigita "Entradas"/"Saídas". */
function flowLabelPlural(value: Flow): string {
  const option = flowKinds.find((kind) => kind.value === value)
  return option?.labelPlural ?? option?.label ?? value
}

/** As chaves do config são iguais aos dataKey das <Bar> — é isso que faz `var(--color-<chave>)` existir. */
const flowConfig = {
  income: { label: flowLabelPlural('income'), color: INCOME_VAR },
  expense: { label: flowLabelPlural('expense'), color: EXPENSE_VAR },
} satisfies ChartConfig

/** Fora do render: objeto inline em prop recria a cada passagem e invalida a memoização do BarChart. */
const CHART_MARGIN = { top: PROJECTION_MARKER_SPACE, right: 8, left: 0, bottom: 0 }

/** Hachura das saídas. Só existe uma instância deste gráfico, então o id pode ser fixo. */
const STRIPE_ID = 'wallet-expense-stripes'

/** As marcas da legenda, e as MESMAS amostras que o tooltip reusa — nunca duas descrições. */
const MARKS: Record<keyof typeof flowConfig, LegendMark> = {
  income: { label: flowConfig.income.label, background: 'var(--series-income)' },
  expense: { label: flowConfig.expense.label, background: EXPENSE_HATCH_SWATCH, ring: true },
}

/** Ponto do gráfico: mês medido ou mês previsto. */
export interface FlowPoint extends MonthSummary {
  projected?: boolean
  /** Parte da saída prevista que já está contratada em parcelas. */
  committed?: number
  /** Mês de projeção sem nada declarado nem contratado: vazio de propósito, não zero. */
  empty?: boolean
  /** Mês MEDIDO ainda em curso, somado às parcelas já contratadas que faltam cair nele. */
  partial?: boolean
  /** Entrada declarada que ainda vence no mês em curso — a parte dele que não é medição. */
  plannedIncome?: number
  /** Saída declarada que ainda vence no mês em curso. */
  plannedExpense?: number
}

interface FlowRow extends FlowPoint {
  /** Quanto das entradas do mês foi consumido pelas saídas. Acima de 1 o mês fechou no vermelho. */
  ratio: number | null
}

/**
 * Etiqueta em pílula no topo da barra de entradas, como no layout de referência.
 * O `y` que o Recharts injeta é o topo da barra; a pílula desce 8px para encostar nela.
 */
const PILL_W = 54
const PILL_H = 22

function RatioPill(props: { x?: number | string; y?: number | string; width?: number | string; value?: number | string }) {
  // `ratio` é null em mês sem entradas (inclusive nos meses ainda por projetar).
  // Sem este teste explícito, Number(null) daria 0 e a pílula mostraria "0,0%".
  if (props.value === null || props.value === undefined) return null
  const x = Number(props.x)
  const y = Number(props.y)
  const width = Number(props.width)
  const value = Number(props.value)
  if (![x, y, width, value].every(Number.isFinite)) return null

  const cx = x + width / 2
  const top = y - PILL_H + 8
  return (
    <g>
      <rect x={cx - PILL_W / 2} y={top} width={PILL_W} height={PILL_H} rx={7} className="fill-card stroke-border" strokeWidth={1} />
      <text x={cx} y={top + PILL_H / 2} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[11px] font-semibold">
        {formatPercent(value, 1)}
      </text>
    </g>
  )
}

interface Props {
  data: FlowPoint[]
  height?: number
  /** Primeiro mês sem dados reais. A partir dele o gráfico marca a faixa como projeção. */
  projectedFrom?: string
  /**
   * Bloco à esquerda da legenda. É onde o layout de referência ancora o número que resume
   * o gráfico. Fica como slot para o componente não precisar saber o que é "resultado".
   */
  headline?: ReactNode
}

export function MonthlyFlowChart({ data, height = 300, projectedFrom, headline }: Props) {
  // Mês previsto não ganha pílula: percentual sobre estimativa passaria falsa precisão.
  // Memoizado porque o pai já memoiza `data`: remontar o array aqui desfaria esse trabalho.
  const rows = useMemo<FlowRow[]>(() => data.map((d) => ({ ...d, ratio: d.projected || d.income <= 0 ? null : d.expense / d.income })), [data])
  const containerStyle = useMemo(() => ({ height }), [height])
  const firstProjected = projectedFrom && data.some((d) => d.month === projectedFrom) ? projectedFrom : null
  const lastMonth = data.length ? data[data.length - 1].month : null

  return (
    <div className="flex flex-col gap-3">
      <ChartHeader headline={headline} marks={[MARKS.income, MARKS.expense]} />

      <ChartContainer config={flowConfig} className={CHART_TOKENS} style={containerStyle}>
        {/* barCategoryGap vale para cada lado da banda: 14% aqui = 28% de vão entre grupos.
            O vão precisa dessa folga porque a fronteira da projeção é desenhada na BORDA da
            banda — com 6% a linha tracejada encostava na coluna dos dois lados. */}
        <BarChart accessibilityLayer data={rows} margin={CHART_MARGIN} barGap={6} barCategoryGap="14%">
          {expenseHatch(STRIPE_ID)}

          <CartesianGrid {...MONEY_GRID} />
          {/* Faixa dos meses ainda sem dados. `ifOverflow="extendDomain"` evitaria recortar,
              mas aqui os limites já são categorias presentes no eixo. */}
          {firstProjected && lastMonth ? <ReferenceArea x1={firstProjected} x2={lastMonth} fill="var(--chart-projection)" fillOpacity={1} stroke="none" /> : null}
          {firstProjected ? <ProjectionDivider month={firstProjected} /> : null}
          <XAxis {...MONTH_AXIS} />
          <YAxis {...MONEY_AXIS} />

          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-48"
                labelFormatter={(label) => formatMonthLongLabel(String(label))}
                formatter={(value, name, item, index) => (
                  <>
                    <span className="flex flex-1 items-center justify-between gap-6">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <MarkSwatch mark={MARKS[name as keyof typeof MARKS]} />
                        {MARKS[name as keyof typeof MARKS]?.label}
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                    </span>
                    {/* Rodapé: um filho `basis-full` no último índice quebra para uma linha inteira. */}
                    {index === 1 ? (
                      <div className="basis-full border-t border-border pt-1.5 text-muted-foreground">
                        {(item.payload as FlowRow).projected ? (
                          <>
                            Previsão: <strong className="text-foreground">{formatBRL((item.payload as FlowRow).committed ?? 0)}</strong>
                          </>
                        ) : (
                          <>
                            Resultado: <strong className="text-foreground">{formatBRL((item.payload as FlowRow).net)}</strong>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              />
            }
          />

          {/* Barra prevista nunca pode parecer barra medida: entrada vira só contorno,
              saída vira hachura fraca. A distinção é estrutural, não de tonalidade. */}
          <Bar dataKey="income" maxBarSize={64} radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.month} fill={r.projected ? 'transparent' : 'var(--color-income)'} stroke={r.projected ? 'var(--series-income)' : 'none'} strokeWidth={r.projected ? 1 : 0} />
            ))}
            <LabelList dataKey="ratio" content={<RatioPill />} />
          </Bar>
          <Bar dataKey="expense" maxBarSize={64} radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              // Saída prevista é contorno tracejado e oco, como na lista: o preenchimento é o
              // que diz "aconteceu", e o tracejado é o mesmo traço do divisor de projeção.
              <Cell
                key={r.month}
                fill={r.projected ? 'transparent' : `url(#${STRIPE_ID})`}
                stroke={r.projected ? 'var(--series-expense)' : 'none'}
                strokeWidth={r.projected ? 1 : 0}
                strokeDasharray={r.projected ? PROJECTION_DASH : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
