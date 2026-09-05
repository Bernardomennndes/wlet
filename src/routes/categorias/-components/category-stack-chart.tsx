import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS, HATCH, SERIES_SWATCH } from '@/components/charts/chart-theme'
import { ProjectionDivider, PROJECTION_MARKER_SPACE } from '@/components/charts/projection-divider'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { categoryColor, OTHER_VAR } from '@/lib/chart-tokens'
import { formatAxis, formatBRL, formatBRLCompact, formatMonthLongLabel, formatMonthShort } from '@/lib/format'
import type { CategoryTotal } from '@/lib/finance'

const MAX_SERIES = 7

/** Despesas por mês, empilhadas pelas principais categorias (demais viram "Outras"). */
interface Props {
  categories: CategoryTotal[]
  months: string[]
  height?: number
  /** Primeiro mês sem lançamentos. Dele em diante a pilha é previsão, não medição. */
  projectedFrom?: string
}

export function CategoryStackChart({ categories, months, height = 280, projectedFrom }: Props) {
  const { config, ids, data } = useMemo(() => {
    const top = categories.filter((c) => c.categoryId !== 'outros').slice(0, MAX_SERIES)
    const topIds = new Set(top.map((c) => c.categoryId))
    const rest = categories.filter((c) => !topIds.has(c.categoryId))
    // A chave do config é o próprio id da categoria (= dataKey da <Bar>). A cor sai de
    // `categoryColor`, a mesma fonte que a BarList do ranking usa, então uma categoria
    // tem um matiz só na tela inteira. Preencher os slots livres pela ordem do recorte
    // atual — que era o que se fazia aqui — dava cor por posição no filtro: "Retirada
    // para o sócio" saía azul na visão PJ e cinza na BarList logo abaixo, e o azul
    // trocava de dono ao mudar o recorte.
    const config: ChartConfig = {}
    for (const c of top) {
      config[c.categoryId] = { label: c.label, color: categoryColor(c.categoryId) }
    }
    if (rest.length) config.__other = { label: 'Outras', color: OTHER_VAR }
    const ids = Object.keys(config)
    const data = months.map((month) => {
      const row: Record<string, number | string | boolean> = { month, projected: projectedFrom ? month >= projectedFrom : false }
      for (const c of top) row[c.categoryId] = c.byMonth[month] ?? 0
      if (rest.length) row.__other = rest.reduce((acc, c) => acc + (c.byMonth[month] ?? 0), 0)
      return row
    })
    return { config, ids, data }
  }, [categories, months, projectedFrom])

  const firstProjected = projectedFrom && months.includes(projectedFrom) ? projectedFrom : null
  const lastMonth = months.length ? months[months.length - 1] : null

  return (
    <ChartContainer config={config} className={CHART_TOKENS} style={{ height }}>
      <BarChart accessibilityLayer data={data} margin={{ top: PROJECTION_MARKER_SPACE, right: 8, left: 0, bottom: 0 }} barCategoryGap="32%">
        <defs>
          {/* Uma hachura por categoria, no matiz da própria série: mês previsto muda de
              textura, não de cor, então a identidade da categoria se mantém. */}
          {ids.map((id) => (
            <pattern key={id} id={`stack-${id}`} width={HATCH.stack.step} height={HATCH.stack.step} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width={HATCH.stack.step} height={HATCH.stack.step} style={{ fill: 'var(--card)' }} />
              <rect width={HATCH.stack.stripe} height={HATCH.stack.step} style={{ fill: `var(--color-${id})` }} />
            </pattern>
          ))}
        </defs>
        {firstProjected && lastMonth ? <ReferenceArea x1={firstProjected} x2={lastMonth} fill="var(--chart-projection)" fillOpacity={1} stroke="none" /> : null}
        {firstProjected ? <ProjectionDivider month={firstProjected} /> : null}
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
        <YAxis tickFormatter={(v: number) => formatAxis(v)} axisLine={false} tickLine={false} width={70} />
        <ChartTooltip
          // `content` sai do spread: colide com o atributo HTML `content` de ComponentProps<'div'> (TS2322).
          content={({ content: _content, ...props }) => {
            // O ChartTooltipContent não filtra zeros nem reordena; a pilha chega de baixo para cima.
            const visible = (props.payload ?? []).filter((p) => Number(p.value) > 0).reverse()
            const total = visible.reduce((acc, p) => acc + Number(p.value), 0)
            return (
              <ChartTooltipContent
                {...props}
                payload={visible}
                className="min-w-44"
                labelFormatter={(label) => formatMonthLongLabel(String(label))}
                formatter={(value, name, _item, index) => (
                  <>
                    <span className="flex flex-1 items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className={SERIES_SWATCH} style={{ background: `var(--color-${name})` }} aria-hidden />
                        {config[String(name)]?.label}
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                    </span>
                    {index === visible.length - 1 ? (
                      <div className="basis-full border-t border-border pt-1.5 text-muted-foreground">
                        {firstProjected && String(props.label) >= firstProjected ? 'Previsão · total ' : 'Total: '}
                        {formatBRLCompact(total)}
                      </div>
                    ) : null}
                  </>
                )}
              />
            )
          }}
        />
        {/* Legenda embaixo: no topo ela ocupa exatamente a faixa em que o marcador de projeção
            precisa escrever, e o Recharts a cola no plot por mais margem que se dê. */}
        <ChartLegend verticalAlign="bottom" itemSorter={null} content={<ChartLegendContent className="flex-wrap justify-start gap-x-4 gap-y-1 text-muted-foreground" />} />
        {ids.map((id, i) => (
          <Bar
            key={id}
            dataKey={id}
            stackId="a"
            // O `fill` aqui não pinta as barras (as <Cell> vencem), mas é dele que a
            // legenda tira a cor do quadradinho de cada série.
            fill={`var(--color-${id})`}
            // Gap de 2px entre segmentos empilhados — regra de dataviz, não vem do registry.
            stroke="var(--card)"
            strokeWidth={1}
            maxBarSize={24}
            radius={i === ids.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          >
            {data.map((row) => (
              <Cell key={String(row.month)} fill={row.projected ? `url(#stack-${id})` : `var(--color-${id})`} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}
