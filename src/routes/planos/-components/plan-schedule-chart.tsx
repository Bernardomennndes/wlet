import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS } from '@/components/charts/chart-theme'
import { EXPENSE_HATCH_SWATCH, expenseHatch, type LegendMark, MONEY_AXIS, MONEY_GRID, MONTH_AXIS, PROJECTION_DASH } from '@/components/charts/money-bar'
import { ChartHeader, MarkSwatch } from '@/components/charts/money-bar-chart'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { planStatuses } from '@/data/types'
import { EXPENSE_VAR } from '@/lib/chart-tokens'
import { formatBRL, formatMonthLongLabel } from '@/lib/format'
/** A linha do gráfico: a base já prevista mais as duas fatias de plano. */
export interface PlanRow {
  month: string
  baseline: number
  decided: number
  considering: number
}

/** Os rótulos saem da lista de enum do domínio — o gráfico não redigita "Decidido". */
const statusLabel = (value: string) => planStatuses.find((s) => s.value === value)?.label ?? value

const scheduleConfig = {
  // A base é uma SÉRIE PRÓPRIA, com matiz próprio: ela não é um plano, e pintá-la na cor de
  // saída como as outras duas faria três coisas diferentes parecerem a mesma. É o mesmo
  // neutro que o resto do app usa para "o que sobra" fora das séries nomeadas.
  baseline: { label: 'Já previsto', color: 'var(--series-other)' },
  decided: { label: statusLabel('decided'), color: EXPENSE_VAR },
  considering: { label: statusLabel('considering'), color: EXPENSE_VAR },
} satisfies ChartConfig

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }
const STRIPE_ID = 'wallet-plan-stripes'

/** As marcas da legenda, e as MESMAS amostras que o tooltip reusa — nunca duas descrições. */
const MARKS: Record<keyof typeof scheduleConfig, LegendMark> = {
  baseline: { label: 'Já previsto', background: 'var(--series-other)' },
  decided: { label: statusLabel('decided'), background: EXPENSE_HATCH_SWATCH, ring: true },
  considering: { label: statusLabel('considering'), dashed: 'var(--series-expense)' },
}

/**
 * A agenda de desembolso dos planos, mês a mês.
 *
 * É o gráfico de fluxo da Visão geral traduzido, e a tradução tem um ponto que precisa ficar
 * dito: lá as duas séries são entrada × saída, e a HACHURA carrega esse eixo. Aqui tudo é
 * saída, então a textura não separa nada — é a §1.1 da `dataviz.md`, que nesse caso a libera
 * para o eixo seguinte. O eixo seguinte desta tela é **decidido × em estudo**: o que já entra
 * na previsão contra o que ainda é hipótese.
 *
 * Daí a codificação, que é a mesma da §3 aplicada a outra pergunta: o decidido é marca CHEIA
 * (hachurada, na cor de saída) e o em estudo é marca OCA de traço tracejado — o mesmo traço do
 * divisor de projeção, que no app inteiro quer dizer "ainda não é fato". Matiz não muda entre
 * as duas: é o mesmo dinheiro saindo, e a diferença é o compromisso.
 *
 * A base — "Já previsto" — é o que o mês já tem sem os planos: parcelas de cartão já compradas,
 * contas declaradas e rubricas, menos o que as cobranças abatem. Ela existe para o gráfico
 * responder "CABE?" e não só "quanto custa": um plano de R$ 1.100 num mês que já tem R$ 4.000
 * comprometidos é outra coisa do mesmo plano num mês vazio.
 *
 * **Não há divisor de projeção nem véu**, ao contrário do gráfico de origem. Lá eles separam o
 * medido do previsto; aqui TUDO é planejamento, e desenhar a fronteira anunciaria uma que não
 * existe.
 *
 * **A coluna é larga (`maxBarSize={64}`) mesmo sendo empilhada**, e isso é desvio declarado da
 * regra de 24px. Aquele limite existe porque o empilhado de Categorias tem oito séries, e num
 * segmento de 4px a hachura vira ruído. Aqui são DUAS, uma delas oca: não há segmento fino a
 * proteger, e a largura é o que faz este gráfico ser lido como irmão do da Visão geral, que é
 * de onde ele veio.
 */
export function PlanScheduleChart({ data, height = 260, headline }: { data: PlanRow[]; height?: number; headline?: ReactNode }) {
  const containerStyle = useMemo(() => ({ height }), [height])

  return (
    <div className="flex flex-col gap-3">
      <ChartHeader headline={headline} marks={[MARKS.baseline, MARKS.decided, MARKS.considering]} />

      <ChartContainer config={scheduleConfig} className={CHART_TOKENS} style={containerStyle}>
        <BarChart accessibilityLayer data={data} margin={CHART_MARGIN} barCategoryGap="14%">
          {expenseHatch(STRIPE_ID)}

          <CartesianGrid {...MONEY_GRID} />
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
                    {index === 2 ? (
                      <div className="basis-full border-t border-border pt-1.5 text-muted-foreground">
                        Total previsto:{' '}
                        <strong className="text-foreground">{formatBRL((item.payload as PlanRow).baseline + (item.payload as PlanRow).decided + (item.payload as PlanRow).considering)}</strong>
                      </div>
                    ) : null}
                  </>
                )}
              />
            }
          />

          {/* Empilhadas: a ALTURA da coluna é o total do mês, que é a pergunta que se faz aqui.
              O raio é decidido POR COLUNA, não por série: com ele fixo na série de cima — o
              padrão do empilhado de Categorias, que tem oito —, todo mês sem nada em estudo
              ficava de topo reto ao lado de um mês arredondado. Com duas séries isso salta à
              vista. Aqui quem arredonda é sempre quem está no topo daquela coluna, e as duas
              nunca arredondam juntas, senão sobraria uma fresta no encontro delas. */}
          <Bar dataKey="baseline" stackId="a" maxBarSize={64} fill="var(--series-other)" isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={row.decided > 0 || row.considering > 0 ? 0 : ([5, 5, 0, 0] as unknown as number)} />
            ))}
          </Bar>
          <Bar dataKey="decided" stackId="a" maxBarSize={64} fill={`url(#${STRIPE_ID})`} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={row.considering > 0 ? 0 : ([5, 5, 0, 0] as unknown as number)} />
            ))}
          </Bar>
          <Bar dataKey="considering" stackId="a" maxBarSize={64} radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} fill="transparent" stroke="var(--series-expense)" strokeWidth={1} strokeDasharray={PROJECTION_DASH} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
