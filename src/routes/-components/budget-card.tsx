import { Check, Warning, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { METER_HEIGHT } from '@/components/charts/chart-theme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BUDGET, budgetState, type BudgetState } from '@/lib/budget'
import { formatBRL, formatMonthLongLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * A faixa de situação é markup próprio, não o `Alert` do registry: ele só tem `default` e
 * `destructive`, e "perto do limite" ficaria idêntico a "dentro dele". É a mesma razão pela
 * qual o `StatusBadge` deste projeto não usa o `Badge`.
 *
 * Ela é montada SEMPRE, mudando de texto e de tom — some-la no estado bom faria o cartão
 * mudar de altura conforme o mês avança.
 */
const STATE: Record<BudgetState, { message: string; Icon: PhosphorIcon; bar: string; banner: string }> = {
  ok: {
    message: 'Dentro do limite do mês',
    Icon: Check,
    bar: 'var(--series-expense)',
    banner: 'border-border text-muted-foreground',
  },
  warning: {
    message: 'Perto do limite do mês',
    Icon: Warning,
    bar: 'var(--status-warning)',
    banner: 'border-[var(--status-warning)]/40 text-[var(--status-warning)]',
  },
  over: {
    message: 'O limite do mês foi ultrapassado',
    Icon: Warning,
    bar: 'var(--status-critical)',
    banner: 'border-[var(--status-critical)]/40 text-[var(--status-critical)]',
  },
}

interface Props {
  /** Saídas medidas do mês corrente, no recorte selecionado. */
  spent: number
  /** O mês que está sendo medido (AAAA-MM) — o cartão não segue o filtro de período. */
  month: string
  className?: string
}

export function BudgetCard({ spent, month, className }: Props) {
  const state = budgetState(spent)
  const { message, Icon, bar, banner } = STATE[state]
  // A barra para em 100%: o excedente é dito pela cor e pela faixa, porque uma barra que
  // estoura o trilho não tem como ser comparada com a de outro mês.
  const share = BUDGET.monthlyLimit > 0 ? Math.min(spent / BUDGET.monthlyLimit, 1) : 0

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle>Controle de orçamento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <span className="text-muted-foreground">Limite de gastos · {formatMonthLongLabel(month)}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="font-semibold text-2xl leading-none tracking-tight">{formatBRL(spent)}</span>
          <span className="text-muted-foreground">de {formatBRL(BUDGET.monthlyLimit)}</span>
        </span>

        <span
          role="img"
          aria-label={`${formatBRL(spent)} de um limite de ${formatBRL(BUDGET.monthlyLimit)}`}
          className={cn(METER_HEIGHT, 'mt-1 flex w-full overflow-hidden rounded-xs bg-[var(--chart-track)]')}
        >
          <span className="h-full rounded-xs" style={{ width: `${share * 100}%`, background: bar }} />
        </span>

        <span className={cn('mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1.5', banner)}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {message}
        </span>
      </CardContent>
    </Card>
  )
}
