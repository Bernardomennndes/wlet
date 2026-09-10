import { formatBRL, formatPercent } from '@/lib/format'
import { ASSET_CLASS_COLOR } from '@/lib/chart-tokens'
import type { InvestmentHolding } from '@/lib/investments'

/**
 * A faixa de posições — o lugar que na referência era uma watchlist de cotações.
 *
 * A watchlist foi trocada, não copiada: ela mostra preço e variação do dia de papéis que o
 * investidor ACOMPANHA, e isso exige cotação ao vivo, que este projeto não tem (a B3 exporta
 * posição, não mercado). Desenhar variação diária aqui seria inventar número.
 *
 * O que ocupa o mesmo lugar responde a pergunta vizinha com dado que existe: quanto cada
 * papel PESA na carteira. A barrinha embaixo é a fatia, então a faixa se lê de relance
 * procurando concentração — que é a leitura útil de uma carteira de doze CDBs.
 */
export function HoldingsStrip({ holdings, total }: { holdings: InvestmentHolding[]; total: number }) {
  return (
    <ul className="flex snap-x gap-3 overflow-x-auto pb-1" aria-label="Papéis da carteira, por peso">
      {holdings.map((holding) => {
        const share = total > 0 ? holding.value / total : 0
        return (
          <li key={holding.code} className="min-w-[168px] shrink-0 snap-start rounded-lg border bg-card p-3">
            <p className="truncate font-mono text-xs font-medium" title={holding.label}>
              {holding.code}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatBRL(holding.value)}</p>
            <div className="mt-2 flex items-center gap-2">
              <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(share * 100, 1.5)}%`, background: ASSET_CLASS_COLOR[holding.kind] }} />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatPercent(share, 1)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
