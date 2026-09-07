import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HATCH, hatchBackground, SERIES_SWATCH } from '@/components/charts/chart-theme'
import { formatAxis, formatBRL, formatMonthShort, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { benchmarkGap, PATRIMONY_RANGES, windowChange, type PatrimonyPoint, type PatrimonyRange } from '@/lib/investments'

const HATCH_ID = 'hero-hatch'

/**
 * Um chip de evolução: rótulo, seta, porcentagem e o valor em reais.
 *
 * O real dentro do chip é o NUMERADOR da própria porcentagem — no bruto, quanto o patrimônio
 * variou; no relativo, quanto a carteira rendeu. Sem essa correspondência os dois chips
 * mostrariam quatro números soltos, e o leitor teria de adivinhar qual real explica qual
 * porcentagem.
 *
 * Os dois vêm em módulo: quem carrega o sinal é a seta, uma vez só. Repeti-lo no real daria
 * "↘ 2,9% −R$ 1.204,00", que lê como duas quedas.
 *
 * A seta leva `aria-hidden` e o sentido é dito por extenso em `sr-only` — "↗" não é lido por
 * leitor de tela, e sem isso a alta e a queda soariam idênticas.
 */
function ChangeChip({ label, value, amount, detail }: { label: string; value: number | null; amount: number | null; detail?: string }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hero-chip)] px-2.5 py-1 text-xs" title={detail}>
      <span className="text-[var(--hero-muted)]">{label}</span>
      <span className="font-medium tabular-nums">
        <span aria-hidden>{up ? '↗' : '↘'}</span>
        <span className="sr-only">{up ? 'alta de' : 'queda de'}</span> {formatPercent(Math.abs(value), 1)}
      </span>
      {amount !== null && (
        <>
          <span aria-hidden className="text-[var(--hero-muted)]">
            ·
          </span>
          <span className="tabular-nums text-[var(--hero-muted)]">{formatBRL(Math.abs(amount))}</span>
        </>
      )}
    </span>
  )
}

/**
 * O cartão-herói: o patrimônio, a janela que se quer olhar, e a forma da curva.
 *
 * Ele é uma SUPERFÍCIE de destaque (`--hero-*`), não uma série colorida — a razão está no
 * comentário dos tokens em `index.css`. Ela é a `--primary` da aplicação e inverte com o tema,
 * então dentro dele o desenho é monocromático — a carteira usa a cor de texto do primary e o
 * CDI é a única cor de contraste. A paleta categórica do app não serve aqui: sobre preto ou
 * sobre branco, metade dela desapareceria.
 *
 * A área é hachurada pela mesma razão de sempre neste projeto (`dataviz.md`): textura no
 * lugar de opacidade. Sobre um fundo cheio, uma área semitransparente vira outra cor e deixa
 * de se ligar à linha que a limita.
 */
export function PatrimonyHero({ data, range, onRangeChange, className }: { data: PatrimonyPoint[]; range: PatrimonyRange; onRangeChange: (range: PatrimonyRange) => void; className?: string }) {
  const last = data.at(-1)
  // Duas evoluções, e a distância entre elas É a informação — a bruta inclui o aporte do
  // período, a relativa o desconta. A conta mora em `windowChange`, na lib: ela já esteve
  // escrita inline aqui, no cartão de CDI e no tooltip, com um helper equivalente sem uso.
  const { grossAmount, grossChange, gain, netChange, contributed } = windowChange(data)

  return (
    <div className={cn('flex flex-col gap-4 rounded-xl bg-[var(--hero)] p-5 text-[var(--hero-foreground)]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--hero-muted)]">Patrimônio</p>
          <span className="block font-mono text-3xl font-semibold tracking-tight tabular-nums">{formatBRL(last?.total ?? 0)}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <ChangeChip
              label="Bruta"
              value={grossChange}
              amount={grossAmount}
              detail={contributed === null ? undefined : `Quanto o patrimônio variou no período — inclui os ${formatBRL(contributed)} que você aportou nele.`}
            />
            <ChangeChip
              label="Relativa"
              value={netChange}
              amount={gain}
              detail={contributed === null ? undefined : `Só o que a carteira rendeu: o aporte do período (${formatBRL(contributed)}) já está descontado.`}
            />
          </div>
        </div>
        {/* Seletor de janela: sem componente do registry porque nenhum deles desenha sobre
            superfície saturada — o ToggleGroup traria o próprio fundo e o próprio anel. */}
        <div className="flex items-center gap-1" role="group" aria-label="Janela de tempo do gráfico">
          {PATRIMONY_RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onRangeChange(r.value)}
              aria-pressed={r.value === range}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                r.value === range ? 'bg-[var(--hero-chip)] text-[var(--hero-foreground)] underline underline-offset-4' : 'text-[var(--hero-muted)] hover:text-[var(--hero-foreground)]',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[248px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <pattern id={HATCH_ID} width={HATCH.stack.step} height={HATCH.stack.step} patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
                <rect width={HATCH.stack.step} height={HATCH.stack.step} fill="var(--hero-area)" />
                <rect width={HATCH.stack.stripe} height={HATCH.stack.step} fill="var(--hero-line)" opacity={0.55} />
              </pattern>
            </defs>
            <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={false} tickLine={false} tickMargin={10} minTickGap={20} tick={{ fill: 'var(--hero-muted)', fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => formatAxis(v)} axisLine={false} tickLine={false} width={66} tick={{ fill: 'var(--hero-muted)', fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: 'var(--hero-line)', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as PatrimonyPoint
                const gap = benchmarkGap(point)
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
                    <p className="mb-1.5 text-xs font-medium">{formatMonthShort(String(label))}</p>
                    <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Patrimônio</dt>
                      <dd className="text-right font-medium tabular-nums">{formatBRL(point.total)}</dd>
                      <dt className="text-muted-foreground">Aportado</dt>
                      <dd className="text-right font-medium tabular-nums">{formatBRL(point.contributed)}</dd>
                      <dt className="text-muted-foreground">100% do CDI</dt>
                      <dd className="text-right font-medium tabular-nums">{formatBRL(point.benchmark)}</dd>
                      {gap !== null && (
                        <>
                          <dt className="text-muted-foreground">Contra o CDI</dt>
                          <dd className="text-right font-medium tabular-nums">
                            {gap >= 0 ? '+' : '−'}
                            {formatPercent(Math.abs(gap), 2)}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                )
              }}
            />
            <Area dataKey="total" stroke="var(--hero-line)" strokeWidth={2} fill={`url(#${HATCH_ID})`} isAnimationActive={false} />
            {/* O CDI é linha, não área: ele é uma referência a comparar, não uma massa que se
                acumula — a mesma decisão da linha de aportado no gráfico de evolução. */}
            <Line dataKey="benchmark" stroke="var(--hero-benchmark)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* O indicador REPRODUZ a marca: o patrimônio é área hachurada, então o quadradinho é
          hachurado; o CDI é linha sólida, então é sólido. Um quadradinho cheio ao lado de uma
          marca hachurada descreveria uma série que não está desenhada. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--hero-muted)]">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={SERIES_SWATCH} style={{ background: hatchBackground('var(--hero-line)', 'var(--hero-area)') }} />
          Patrimônio
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={SERIES_SWATCH} style={{ background: 'var(--hero-benchmark)' }} />
          Os mesmos aportes a 100% do CDI
        </span>
      </div>
    </div>
  )
}
