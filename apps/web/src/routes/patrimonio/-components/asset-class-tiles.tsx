import { formatBRL, formatPercent } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { ASSET_CLASS_COLOR } from '@/lib/chart-tokens'
import type { AssetClass } from '@/lib/investments'

/**
 * Os tiles de classe de ativo: a barrinha de cor é o que liga o número ao treemap e ao
 * gráfico, e por isso ela repete o token, nunca uma cor escolhida aqui.
 */
export function AssetClassTiles({ classes, className }: { classes: AssetClass[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2', className)} aria-label="Composição por classe de ativo">
      {classes.map((asset) => (
        <li key={asset.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className={SERIES_SWATCH} style={{ background: ASSET_CLASS_COLOR[asset.id] }} />
            <span className="text-xs text-muted-foreground">{asset.label}</span>
          </div>
          <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{formatBRL(asset.value)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatPercent(asset.share, 1)} da carteira</p>
        </li>
      ))}
    </ul>
  )
}
