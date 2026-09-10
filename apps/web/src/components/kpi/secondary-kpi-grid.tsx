import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { KpiValue } from './kpi-value'
import type { KpiTone } from './kpi-tone'
import { MetricInfoPopover, type MetricDefinition } from './metric-info-popover'

export interface SecondaryKpiItem {
  key: string
  definition: MetricDefinition
  label: string
  /** `null` = sem valor. Ver `KpiValue`. */
  value: ReactNode | null
  emptyLabel?: string
  hint?: ReactNode
  tone?: KpiTone
}

/**
 * Grade densa: um `<Card>` único com todas as células, mesmo truque de divisor do
 * `KpiCardGrid` e tipografia menor.
 *
 * `columns` não existe na versão original, que é fixa em 2/4. Aqui ele existe porque este
 * app tem blocos de um e de dois números — a tela de Contas tem um KPI só na conta virtual,
 * e numa grade de duas colunas ele deixaria metade da fileira vazia.
 */
const COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 4: 'grid-cols-2 md:grid-cols-4' } as const

export function SecondaryKpiGrid({ items, columns = 4, className }: { items: SecondaryKpiItem[]; columns?: keyof typeof COLUMNS; className?: string }) {
  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div className={cn('grid gap-px bg-border', COLUMNS[columns])}>
        {items.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col gap-1.5 bg-card px-4 py-3.5">
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">{item.label}</span>
              <MetricInfoPopover definition={item.definition} />
            </span>
            <KpiValue size="compact" tone={item.tone ?? 'default'} emptyLabel={item.emptyLabel}>
              {item.value}
            </KpiValue>
            {item.hint ? <span className="truncate text-[10px] text-muted-foreground">{item.hint}</span> : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
