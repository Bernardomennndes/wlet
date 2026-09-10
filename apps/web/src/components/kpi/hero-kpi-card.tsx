import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { MetricInfoPopover, type MetricDefinition } from './metric-info-popover'

/**
 * Cartão grande para a métrica estrela: o corpo é um medidor ou um gráfico, não um número
 * cru. Diferente do `KpiCard`, ele É um `<Card>` inteiro — uma fileira de heróis é cartão +
 * vão, nunca célula de grade conectada, porque cada um é um objeto e não um número a
 * confrontar com o vizinho.
 */
export function HeroKpiCard({ label, definition, children, className }: { label: string; definition: MetricDefinition; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="flex h-full min-h-36 flex-col gap-4 p-5">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">{label}</span>
          <MetricInfoPopover definition={definition} />
        </span>
        <span className="flex flex-1 flex-col justify-end gap-3">{children}</span>
      </CardContent>
    </Card>
  )
}
