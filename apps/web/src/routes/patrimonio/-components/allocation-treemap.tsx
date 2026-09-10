import { formatBRL, formatPercent } from '@wlet/lib/format'
import { hatchBackground } from '@/components/charts/chart-theme'
import { ASSET_CLASS_COLOR } from '@/lib/chart-tokens'
import type { InvestmentHolding } from '@/lib/investments'

interface Cell {
  code: string
  label: string
  value: number
  share: number
  color: string
  /** Caixa não é papel: hachurado para não se confundir com uma posição. */
  hatched: boolean
}

/**
 * A alocação como blocos proporcionais — o "Allocation Performance" da referência.
 *
 * É um treemap de UMA linha em CSS grid, não o `Treemap` do Recharts: com quinze itens em que
 * doze são CDB, o algoritmo squarified produz retângulos de proporções muito diferentes e os
 * rótulos deixam de caber. Um `grid-template-columns` com fração proporcional ao valor
 * mantém a leitura — a largura É a fatia — e sobrevive ao redimensionamento.
 *
 * Abaixo de 4% de participação o rótulo sai: um bloco de 30px com texto dentro fica ilegível
 * e some no `overflow`. O valor continua no `title` e na lista de posições ao lado.
 */
export function AllocationTreemap({ holdings, cash, total }: { holdings: InvestmentHolding[]; cash: number; total: number }) {
  const cells: Cell[] = holdings
    .map((h) => ({ code: h.code, label: h.label, value: h.value, share: total > 0 ? h.value / total : 0, color: ASSET_CLASS_COLOR[h.kind], hatched: false }))
    .concat(cash > 0 ? [{ code: 'Caixa', label: 'Caixa na corretora', value: cash, share: total > 0 ? cash / total : 0, color: ASSET_CLASS_COLOR.cash, hatched: true }] : [])
    .sort((a, b) => b.value - a.value)

  return (
    <div className="flex h-[180px] w-full gap-1 overflow-hidden rounded-lg" style={{ display: 'grid', gridTemplateColumns: cells.map((c) => `${Math.max(c.share, 0.008)}fr`).join(' ') }}>
      {cells.map((cell) => (
        <div
          key={cell.code}
          className="relative flex min-w-0 flex-col justify-end overflow-hidden rounded-md p-2"
          style={{ background: cell.hatched ? hatchBackground(cell.color, 'var(--card)') : cell.color }}
          title={`${cell.label} — ${formatBRL(cell.value)} (${formatPercent(cell.share, 1)})`}
        >
          {cell.share >= 0.04 && (
            <div className="min-w-0">
              <p className="truncate font-mono text-[10px] font-medium text-white/85">{cell.code}</p>
              <p className="truncate text-[11px] font-semibold text-white tabular-nums">{formatPercent(cell.share, 0)}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
