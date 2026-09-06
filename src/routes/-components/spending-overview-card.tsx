import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router'
import { METER_HEIGHT, SERIES_SWATCH } from '@/components/charts/chart-theme'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NotInformed } from '@/components/not-informed'
import { formatBRL, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { splitExpense, type ExpenseSegment } from '@/lib/expense-segments'

interface Props {
  /** Saídas do período. */
  expense: number
  /** Entradas do período — o "de quanto" que dá escala ao gasto. */
  income: number
  /** Saídas por categoria do período, do maior para o menor. */
  segments: ExpenseSegment[]
  /** Variação do último mês completo contra o anterior, ou `null` se não há dois meses. */
  delta: number | null
  /** "Ago 26 vs Jul 26" — o par que a variação compara. */
  deltaLabel: string
  className?: string
}

/** Onde o gasto do período foi parar: o total, a variação e as maiores categorias. */
export function SpendingOverviewCard({ expense, income, segments, delta, deltaLabel, className }: Props) {
  const parts = splitExpense(segments, expense)

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle>Visão de gastos</CardTitle>
        <CardAction>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon-sm" render={<Link to="/categorias" aria-label="Ver todas as categorias" />} />}>
              <MoreHorizontal />
            </TooltipTrigger>
            <TooltipContent>Ver todas as categorias</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-2xl leading-none tracking-tight tabular-nums">{formatBRL(expense)}</span>
          {/* Gasto que sobe é notícia ruim: o verde fica para a queda. */}
          {delta === null ? null : (
            <span className={cn('rounded-md px-1.5 py-0.5 font-medium tabular-nums', delta > 0 ? 'text-[var(--status-critical)]' : 'text-[var(--status-good-text)]')}>
              {delta >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta))} <span className="font-normal text-muted-foreground">{deltaLabel}</span>
            </span>
          )}
        </div>
        <span className="text-muted-foreground tabular-nums">de {formatBRL(income)} em entradas</span>

        {parts.length === 0 ? (
          <NotInformed>Sem saídas no período</NotInformed>
        ) : (
          <>
            {/* `role="img"`: as fatias são desenho, e a legenda abaixo já diz tudo por escrito. */}
            <span
              role="img"
              aria-label={`Composição das saídas: ${parts.map((p) => `${p.label} ${formatBRL(p.value)}`).join(', ')}`}
              className={cn(METER_HEIGHT, 'mt-1 flex w-full items-stretch gap-1')}
            >
              {parts.map((part) => (
                <span key={part.key} className="h-full min-w-0.5 rounded-xs" style={{ width: `${(part.value / expense) * 100}%`, background: part.background }} />
              ))}
            </span>

            <ul className="mt-1 flex flex-col gap-1.5">
              {parts.map((part) => (
                <li key={part.key} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className={SERIES_SWATCH} style={{ background: part.background }} />
                    <span className="truncate text-muted-foreground">{part.label}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatBRL(part.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
