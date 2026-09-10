import { Area, ComposedChart, Line, ResponsiveContainer, XAxis } from 'recharts'
import { HATCH, hatchBackground, SERIES_SWATCH } from '@/components/charts/chart-theme'
import { formatMonthShort, formatPercent } from '@/lib/format'
import { benchmarkGap, type PatrimonyPoint } from '@/lib/investments'

const HATCH_ID = 'benchmark-hatch'

/**
 * O desvio contra o CDI — a leitura que a referência chamava de "Performance Deviation".
 *
 * O benchmark aqui é REAL e não decorativo: é a série do Banco Central aplicada aos MESMOS
 * aportes, nas mesmas datas. Isso importa porque comparar a rentabilidade de uma carteira com
 * aporte irregular contra um índice é quase sempre enganoso — quem aportou muito num mês bom
 * parece gênio. Dando ao benchmark o mesmo fluxo de caixa, a diferença que sobra é só
 * escolha de ativo.
 *
 * A escala é dupla e proposital: as duas curvas dividem o eixo, então o que se lê é a
 * DISTÂNCIA entre elas, não o valor de cada uma — o valor já está no herói.
 */
export function BenchmarkCard({ data }: { data: PatrimonyPoint[] }) {
  const last = data.at(-1)
  const gap = last ? benchmarkGap(last) : null
  const ahead = (gap ?? 0) >= 0

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl bg-[var(--hero)] p-5 text-[var(--hero-foreground)]">
      <div>
        <p className="text-xs font-medium text-[var(--hero-muted)]">Contra o CDI</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-tight tabular-nums">{gap === null ? '—' : `${ahead ? '+' : '−'}${formatPercent(Math.abs(gap), 2)}`}</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--hero-muted)]">
          {gap === null ? (
            'Sem CDI em cache para comparar.'
          ) : (
            <>
              A carteira está <strong className="font-semibold text-[var(--hero-foreground)]">{ahead ? 'acima' : 'abaixo'}</strong> do que os mesmos aportes teriam rendido a{' '}
              <strong className="font-semibold text-[var(--hero-foreground)]">100% do CDI</strong>, nas mesmas datas.
            </>
          )}
        </p>
      </div>

      <div className="mt-auto h-[132px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <pattern id={HATCH_ID} width={HATCH.fine.step} height={HATCH.fine.step} patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
                <rect width={HATCH.fine.step} height={HATCH.fine.step} fill="var(--hero-area)" />
                <rect width={HATCH.fine.stripe} height={HATCH.fine.step} fill="var(--hero-line)" opacity={0.5} />
              </pattern>
            </defs>
            <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={false} tickLine={false} tickMargin={6} minTickGap={28} tick={{ fill: 'var(--hero-muted)', fontSize: 10 }} />
            <Area dataKey="total" stroke="var(--hero-line)" strokeWidth={1.75} fill={`url(#${HATCH_ID})`} isAnimationActive={false} />
            <Line dataKey="benchmark" stroke="var(--hero-benchmark)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--hero-muted)]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={SERIES_SWATCH} style={{ background: hatchBackground('var(--hero-line)', 'var(--hero-area)') }} />
          Carteira
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={SERIES_SWATCH} style={{ background: 'var(--hero-benchmark)' }} />
          CDI
        </span>
      </div>
    </div>
  )
}
