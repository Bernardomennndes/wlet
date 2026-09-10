import type { ComponentProps } from 'react'
import { Card } from '@wlet/ui/components/card'
import { Skeleton } from '@wlet/ui/components/skeleton'
import { cn } from '@wlet/lib/utils'

/**
 * A fileira de KPIs: um cartão ÚNICO, dividido por linhas de 1px.
 *
 * A grade tem `gap-px` sobre um fundo `bg-border`, e cada célula pinta o próprio `bg-card`
 * por cima. O divisor não é uma borda declarada em lugar nenhum: é o fundo do container
 * aparecendo no vão de 1px entre duas células. A consequência não precisa de lógica — o
 * traço só existe onde há duas células vizinhas, o horizontal nasce sozinho quando a grade
 * quebra, e a aresta externa não duplica porque quem a desenha é o `<Card>`.
 *
 * `overflow-hidden` no `Card` é o que faz as células respeitarem o raio dos cantos.
 *
 * `columns` é DECLARADO: a quebra de uma fileira é decisão semântica, e o Tailwind não
 * enxerga classe montada por interpolação, então contar `React.Children` produziria uma
 * grade que nunca é gerada. Todo `col-span` de um breakpoint é DESFEITO no maior — sem isso
 * a classe do `lg` sobrevive para cima e o último cartão fica esticado quando já cabe.
 */
const GRID_RECIPES = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 lg:grid-cols-3 lg:[&>*:last-child]:col-span-1',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:[&>*:last-child]:col-span-3 xl:grid-cols-4 xl:[&>*:last-child]:col-span-1',
  5: 'grid-cols-1 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2 lg:grid-cols-3 lg:[&>*:last-child]:col-span-2 xl:grid-cols-5 xl:[&>*:last-child]:col-span-1',
} as const

export type KpiCardGridColumns = keyof typeof GRID_RECIPES

export function KpiCardGrid({ columns, className, children, ...props }: ComponentProps<'div'> & { columns: KpiCardGridColumns }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('grid gap-px bg-border', GRID_RECIPES[columns], className)} {...props}>
        {children}
      </div>
    </Card>
  )
}

/**
 * O esqueleto de UMA célula. Vive aqui, e não em cada tela, porque é o par do `KpiCard`: os
 * dois têm de ocupar exatamente o mesmo espaço. As medidas espelham o cartão — `h-2.5` o
 * rótulo em versalete, `size-4` o ⓘ, `h-9` a caixa de linha do valor (`leading-9`).
 */
export function KpiCardSkeleton() {
  return (
    <div data-slot="kpi-card" className="flex flex-col gap-1 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="size-4 rounded-full" />
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
  )
}
