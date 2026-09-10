import { Badge } from '@/components/ui/badge'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { cn } from '@/lib/utils'
import { categoryLabel } from '@/data/categories'
import { categoryColor } from '@/lib/chart-tokens'

/**
 * Categoria de um lançamento. O prefixo é o ponto de cor do slot fixo — a mesma cor que a
 * categoria tem em qualquer gráfico, para o olho ligar tabela e série sem legenda no meio.
 * Categoria desconhecida cai no id cru (`categoryLabel`), nunca em célula vazia.
 */
export function CategoryBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      <span className={cn(SERIES_SWATCH, 'mr-1')} style={{ background: categoryColor(value) }} aria-hidden />
      {categoryLabel(value)}
    </Badge>
  )
}
