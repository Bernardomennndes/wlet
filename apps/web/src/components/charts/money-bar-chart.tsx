import type { ReactNode } from 'react'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import type { LegendMark } from '@/components/charts/money-bar'
import { cn } from '@wlet/lib/utils'

/**
 * As peças de TELA do gráfico de barras em reais por mês. O vocabulário sem JSX de componente
 * — tokens, props de eixo e o `<pattern>` da hachura — mora em `money-bar.tsx`, ao lado.
 *
 * A separação é a regra do fast refresh que este projeto já aprendeu duas vezes: constante ou
 * função exportada ao lado de componente derruba o recarregamento do arquivo inteiro. Foram
 * cinco avisos novos de lint quando os dois moravam juntos.
 */

/** O quadradinho. Serve à legenda e ao tooltip, para os dois nunca discordarem. */
export function MarkSwatch({ mark, className }: { mark: LegendMark; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(SERIES_SWATCH, mark.dashed && 'border border-dashed', mark.outlined && 'border border-solid', mark.ring && 'ring-1 ring-border ring-inset', className)}
      style={mark.dashed ? { borderColor: mark.dashed } : mark.outlined ? { borderColor: mark.outlined } : { background: mark.background }}
    />
  )
}

/**
 * A linha acima do gráfico: o número que o ancora à esquerda, a legenda à direita.
 *
 * A legenda fica FORA da área de plotagem de propósito. O Recharts cola a legenda dele no
 * plot por mais margem que se dê, e nos gráficos que marcam projeção ela escreveria por cima
 * do rótulo do divisor.
 */
export function ChartHeader({ headline, marks }: { headline?: ReactNode; marks: LegendMark[] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      {headline ?? <span />}
      <div className="flex items-center gap-5 text-xs font-medium">
        {marks.map((mark) => (
          <span key={mark.label} className="flex items-center gap-2">
            <MarkSwatch mark={mark} className="size-3.5" />
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  )
}
