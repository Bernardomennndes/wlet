import { Area, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS } from '@/components/charts/chart-theme'
import { ASSET_CLASS_COLOR } from '@/lib/chart-tokens'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@wlet/ui/components/chart'
import { formatAxis, formatBRL, formatMonthShort } from '@wlet/lib/format'
import type { PatrimonyPoint } from '@/lib/investments'

// As cores das classes saem de `ASSET_CLASS_COLOR`, não escritas aqui: os tiles, a faixa de
// papéis e o treemap leem da mesma constante, e uma cópia divergiria no primeiro ajuste.
const CONFIG: ChartConfig = {
  fixedIncome: { label: 'Renda fixa', color: ASSET_CLASS_COLOR['fixed-income'] },
  equity: { label: 'Ações e BDR', color: ASSET_CLASS_COLOR.equity },
  cash: { label: 'Caixa', color: ASSET_CLASS_COLOR.cash },
  contributed: { label: 'Aportado', color: 'var(--series-income)' },
}

/**
 * A evolução do patrimônio: área empilhada para o VALOR, linha para o CUSTO.
 *
 * A escolha de marca é a leitura. Valor é uma massa que se acumula e se divide em classes —
 * área empilhada. Aportado é uma referência contra a qual se compara, não uma parte do todo —
 * linha, por cima. A distância vertical entre a linha e o topo da área é o rendimento, que
 * assim se lê sem precisar de uma terceira série.
 *
 * O CAIXA é a terceira camada da pilha, e precisa estar ali: ele entra no `total`, então uma
 * pilha sem ele deixaria de somar o número que o KPI exibe. Ele também é o que impede a área
 * de despencar num mês em que uma posição foi vendida e ainda não reaplicada.
 *
 * Sem tratamento de previsão: aqui não há mês futuro. Toda a série é medição, e a única
 * incerteza — ações a custo — está dita no texto do cartão, não codificada na marca.
 */
export function PatrimonyChart({ data, height = 280 }: { data: PatrimonyPoint[]; height?: number }) {
  return (
    <ChartContainer config={CONFIG} className={CHART_TOKENS} style={{ height, width: '100%' }}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => formatAxis(v)} axisLine={false} tickLine={false} width={70} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatMonthShort(String(value))}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{CONFIG[name as keyof typeof CONFIG]?.label ?? name}</span>
                  <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Area dataKey="fixedIncome" stackId="valor" stroke="var(--color-fixedIncome)" fill="var(--color-fixedIncome)" fillOpacity={0.9} strokeWidth={0} isAnimationActive={false} />
        <Area dataKey="equity" stackId="valor" stroke="var(--color-equity)" fill="var(--color-equity)" fillOpacity={0.9} strokeWidth={0} isAnimationActive={false} />
        <Area dataKey="cash" stackId="valor" stroke="var(--color-cash)" fill="var(--color-cash)" fillOpacity={0.9} strokeWidth={0} isAnimationActive={false} />
        {/* Tracejada: o aportado é referência, não uma parte da massa — e o traço evita que
            ela seja lida como mais uma camada da pilha. */}
        <Line dataKey="contributed" stroke="var(--color-contributed)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        <ChartLegend verticalAlign="bottom" content={<ChartLegendContent className="flex-wrap justify-start gap-x-4 gap-y-1 text-muted-foreground" />} />
      </ComposedChart>
    </ChartContainer>
  )
}
