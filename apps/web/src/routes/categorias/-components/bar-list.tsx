import type { ReactNode } from 'react'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { BarProgress } from '@/components/ui/bar-progress'
import { ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { formatBRL, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface BarListItem {
  key: string
  label: ReactNode
  value: number
  share?: number
  color?: string
  meta?: ReactNode
  onClick?: () => void
}

function Row({ item, top }: { item: BarListItem; top: number }) {
  return (
    <BarProgress value={item.value} max={top} color={item.color} getAriaValueText={() => formatBRL(item.value)}>
      <ProgressLabel className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs">
        {item.color ? <span className={cn(SERIES_SWATCH, 'bg-[var(--bar-color)]')} aria-hidden /> : null}
        <span className={cn('truncate', item.onClick && 'hover:underline')}>{item.label}</span>
      </ProgressLabel>
      <span className="flex shrink-0 items-center gap-2 tabular-nums">
        {item.meta ? <span className="text-muted-foreground">{item.meta}</span> : null}
        {item.share !== undefined ? <span className="w-9 text-right text-muted-foreground">{item.share > 0 && item.share < 0.005 ? '<1%' : formatPercent(item.share)}</span> : null}
        <ProgressValue className="ml-0 w-24 text-right font-medium text-foreground">{(_f, v) => formatBRL(v ?? 0)}</ProgressValue>
      </span>
    </BarProgress>
  )
}

/** Ranking horizontal em um só matiz: magnitude, não identidade. */
export function BarList({ items, max, className }: { items: BarListItem[]; max?: number; className?: string }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item) => (
        // O alvo focável é o <button>: onClick no <li> deixaria a linha inalcançável pelo teclado.
        <li key={item.key} className="text-left text-xs">
          {item.onClick ? (
            <button type="button" className="w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={item.onClick}>
              <Row item={item} top={top} />
            </button>
          ) : (
            <Row item={item} top={top} />
          )}
        </li>
      ))}
    </ul>
  )
}
