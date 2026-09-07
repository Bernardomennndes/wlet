import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { formatBRL } from '@/lib/format'
import type { IncomeMonth } from '@/lib/investments'

/**
 * As três naturezas de provento, com cor fixa — a mesma disciplina de `categoryColor`.
 * O rodapé, a pilha e a legenda leem daqui, então nenhuma delas escolhe cor por posição.
 */
const NATURES = [
  { id: 'dividends', label: 'Dividendos', color: 'var(--series-4)', hint: 'Isentos na pessoa física' },
  { id: 'jcp', label: 'JCP', color: 'var(--series-2)', hint: '15% retidos na fonte' },
  { id: 'yields', label: 'Rendimentos', color: 'var(--series-3)', hint: 'Renda fixa e cashback' },
] as const

/**
 * Os proventos mês a mês.
 *
 * As barras são HTML e não Recharts de propósito: o desenho da referência é uma pílula de
 * topo arredondado sobre um trilho, e reproduzir trilho + cap redondo em SVG custa mais do
 * que num `div` — é a mesma escolha que a barra de volume da lista de meses já faz.
 *
 * O trilho existe para dar escala. Sem ele, um mês de R$ 3 e um de R$ 90 aparecem como duas
 * barras curtas em telas diferentes; com ele, a altura vazia diz o quanto faltou para o
 * melhor mês.
 *
 * A pilha dentro da barra é a composição do mês, e não uma decoração: dividendo é isento e
 * JCP tem retenção, então saber QUAL parte cresceu é a leitura, não só quanto.
 */
export function IncomeCard({ income, until }: { income: IncomeMonth[]; until: string }) {
  // Os doze meses de CALENDÁRIO até `until`, e não os doze últimos meses COM provento.
  //
  // Sem o preenchimento, o eixo pulava de 09 para 11 e as barras ficavam encostadas: um mês
  // sem dividendo aparecia como se não existisse, e a leitura "recebi menos neste mês"
  // desaparecia junto. Mês vazio é dado, não ausência de dado.
  const byMonth = new Map(income.map((m) => [m.month, m]))
  const months: IncomeMonth[] = []
  const [ey, em] = until.split('-').map(Number)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    months.push(byMonth.get(key) ?? { month: key, dividends: 0, jcp: 0, yields: 0, total: 0 })
  }
  const peak = Math.max(...months.map((m) => m.total), 0)
  const totals = income.reduce((sum, m) => ({ dividends: sum.dividends + m.dividends, jcp: sum.jcp + m.jcp, yields: sum.yields + m.yields }), { dividends: 0, jcp: 0, yields: 0 })
  const grand = totals.dividends + totals.jcp + totals.yields

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Recebido no total</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{formatBRL(grand)}</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {NATURES.map((n) => (
            <li key={n.id} className="flex items-center gap-1.5">
              <span aria-hidden className={SERIES_SWATCH} style={{ background: n.color }} />
              {n.label}
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex h-[168px] items-end gap-1.5" aria-label="Proventos por mês">
        {months.map((month) => {
          const height = peak > 0 ? month.total / peak : 0
          return (
            <li key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              {/* O trilho ocupa a altura toda; a pilha cresce dentro dele. */}
              <span className="relative flex w-full flex-1 flex-col justify-end overflow-hidden rounded-full bg-[var(--chart-track)]" title={`${month.month}: ${formatBRL(month.total)}`}>
                <span className="flex w-full flex-col-reverse overflow-hidden rounded-full" style={{ height: `${Math.max(height * 100, month.total > 0 ? 4 : 0)}%` }}>
                  {NATURES.map((n) => {
                    const value = month[n.id]
                    if (value <= 0) return null
                    return <span key={n.id} className="w-full" style={{ height: `${(value / month.total) * 100}%`, background: n.color }} />
                  })}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground">{month.month.slice(5)}</span>
            </li>
          )
        })}
      </ul>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
        {NATURES.map((n) => (
          <div key={n.id} className="bg-card p-3 text-center">
            <dt className="text-xs text-muted-foreground">{n.label}</dt>
            <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatBRL(totals[n.id])}</dd>
            <dd className="mt-0.5 text-[10px] text-muted-foreground">{n.hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
