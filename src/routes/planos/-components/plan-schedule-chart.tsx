import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS, HATCH, hatchBackground, SERIES_SWATCH } from '@/components/charts/chart-theme'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { planStatuses } from '@/data/types'
import { EXPENSE_VAR } from '@/lib/chart-tokens'
import { formatAxis, formatBRL, formatMonthLongLabel, formatMonthShort } from '@/lib/format'
import type { PlanScheduleMonth } from '@/lib/plans'
import { cn } from '@/lib/utils'

/** Os rótulos saem da lista de enum do domínio — o gráfico não redigita "Decidido". */
const statusLabel = (value: string) => planStatuses.find((s) => s.value === value)?.label ?? value

const scheduleConfig = {
  decided: { label: statusLabel('decided'), color: EXPENSE_VAR },
  considering: { label: statusLabel('considering'), color: EXPENSE_VAR },
} satisfies ChartConfig

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }
const STRIPE_ID = 'wallet-plan-stripes'
/** O mesmo tracejado do divisor de projeção: no app inteiro ele quer dizer "ainda não é fato". */
const HYPOTHESIS_DASH = '4 4'
const STRIPE_SWATCH = hatchBackground('var(--series-expense-stripe)', 'var(--series-expense-fill)')

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
export function PlanScheduleChart({ data, height = 260, headline }: { data: PlanScheduleMonth[]; height?: number; headline?: ReactNode }) {
  const containerStyle = useMemo(() => ({ height }), [height])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {headline ?? <span />}
        <div className="flex items-center gap-5 text-xs font-medium">
          <span className="flex items-center gap-2">
            <span className={cn(SERIES_SWATCH, 'size-3.5 ring-1 ring-border ring-inset')} style={{ background: STRIPE_SWATCH }} aria-hidden />
            {scheduleConfig.decided.label}
          </span>
          {/* O quadradinho REPRODUZ a marca (§2): oco e de traço tracejado, como a barra. */}
          <span className="flex items-center gap-2">
            <span className={cn(SERIES_SWATCH, 'size-3.5 border border-dashed')} style={{ borderColor: 'var(--series-expense)' }} aria-hidden />
            {scheduleConfig.considering.label}
          </span>
        </div>
      </div>

      <ChartContainer config={scheduleConfig} className={CHART_TOKENS} style={containerStyle}>
        <BarChart accessibilityLayer data={data} margin={CHART_MARGIN} barCategoryGap="14%">
          <defs>
            <pattern id={STRIPE_ID} width={HATCH.wide.step} height={HATCH.wide.step} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width={HATCH.wide.step} height={HATCH.wide.step} style={{ fill: 'var(--series-expense-fill)' }} />
              <rect width={HATCH.wide.stripe} height={HATCH.wide.step} style={{ fill: 'var(--series-expense-stripe)' }} />
            </pattern>
          </defs>

          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} tickMargin={12} />
          <YAxis tickFormatter={(v: number) => formatAxis(v)} axisLine={false} tickLine={false} width={70} />

          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-48"
                labelFormatter={(label) => formatMonthLongLabel(String(label))}
                formatter={(value, name, item, index) => (
                  <>
                    <span className="flex flex-1 items-center justify-between gap-6">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span
                          className={cn(SERIES_SWATCH, name === 'considering' && 'border border-dashed')}
                          style={name === 'considering' ? { borderColor: 'var(--series-expense)' } : { background: STRIPE_SWATCH }}
                          aria-hidden
                        />
                        {scheduleConfig[name as keyof typeof scheduleConfig]?.label}
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                    </span>
                    {index === 1 ? (
                      <div className="basis-full border-t border-border pt-1.5 text-muted-foreground">
                        Total do mês: <strong className="text-foreground">{formatBRL((item.payload as PlanScheduleMonth).decided + (item.payload as PlanScheduleMonth).considering)}</strong>
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
          <Bar dataKey="decided" stackId="a" maxBarSize={64} fill={`url(#${STRIPE_ID})`} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={row.considering > 0 ? 0 : ([5, 5, 0, 0] as unknown as number)} />
            ))}
          </Bar>
          <Bar dataKey="considering" stackId="a" maxBarSize={64} radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} fill="transparent" stroke="var(--series-expense)" strokeWidth={1} strokeDasharray={HYPOTHESIS_DASH} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
