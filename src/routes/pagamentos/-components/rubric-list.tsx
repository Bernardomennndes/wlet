import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { NotInformed } from '@/components/not-informed'
import { BarProgress } from '@/components/ui/bar-progress'
import { CategoryBadge } from '@/components/category-badge'
import { BUDGET, budgetState, type BudgetState } from '@/lib/budget'
import { formatBRL, formatMonthLongLabel, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface Rubric {
  categoryId: string
  label: string
  amount: number
  spent: number
}

/** A mesma tradução de situação em cor do cartão de orçamento — uma régua só nas duas telas. */
const BAR_COLOR: Record<BudgetState, string> = {
  ok: 'var(--series-expense)',
  warning: 'var(--status-warning)',
  over: 'var(--status-critical)',
}

/**
 * As rubricas do mês em curso.
 *
 * A barra para em 100%: o excedente é dito pela cor e pelo número, porque uma barra que
 * estoura o trilho não tem como ser comparada com a da rubrica vizinha — mesma decisão do
 * cartão de orçamento da Visão geral.
 */
export function RubricList({ rubrics, month }: { rubrics: Rubric[]; month: string }) {
  if (rubrics.length === 0) {
    return <NotInformed>Nenhuma rubrica declarada</NotInformed>
  }
  return (
    <DataList aria-label="Rubricas de gasto">
      {rubrics.map((rubric) => {
        const share = rubric.amount > 0 ? rubric.spent / rubric.amount : 0
        // O mesmo limiar do teto global, para "perto do limite" significar a mesma coisa nas
        // duas telas — um `warnAt` por rubrica seria outra régua sem motivo.
        const state = budgetState(rubric.spent, { monthlyLimit: rubric.amount, warnAt: BUDGET.warnAt })
        const left = rubric.amount - rubric.spent
        return (
          <DataListItem key={rubric.categoryId} className="gap-2">
            <DataListItemHeader>
              <CategoryBadge value={rubric.categoryId} />
              <span className={cn('tabular-nums', state === 'over' && 'text-[var(--status-critical)]', state === 'warning' && 'text-[var(--status-warning-text)]')}>{formatPercent(share, 0)}</span>
            </DataListItemHeader>
            <BarProgress
              value={Math.min(rubric.spent, rubric.amount)}
              max={rubric.amount}
              color={BAR_COLOR[state]}
              getAriaValueText={() => `${formatBRL(rubric.spent)} de ${formatBRL(rubric.amount)}`}
            >
              <span className="sr-only">{rubric.label}</span>
            </BarProgress>
            <DataListItemFields>
              <DataListField label={`Gasto em ${formatMonthLongLabel(month).toLowerCase()}`} separator={false}>
                {formatBRL(rubric.spent)}
              </DataListField>
              <DataListField label="Planejado">{formatBRL(rubric.amount)}</DataListField>
              <DataListField label={left >= 0 ? 'Ainda cabe' : 'Passou'}>{formatBRL(Math.abs(left))}</DataListField>
            </DataListItemFields>
          </DataListItem>
        )
      })}
    </DataList>
  )
}
