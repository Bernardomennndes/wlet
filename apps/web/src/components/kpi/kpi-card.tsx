import type { ReactNode } from 'react'
import { cn } from '@wlet/lib/utils'
import { KpiValue } from './kpi-value'
import type { KpiTone } from './kpi-tone'
import { MetricInfoPopover, type MetricDefinition } from './metric-info-popover'

interface KpiCardProps {
  label: string
  /**
   * Como o número é calculado, na língua de quem lê. OBRIGATÓRIO, e esse é o ponto do
   * componente: um KPI é um número arrancado do contexto, então o único lugar que sobra
   * para o contexto é ao lado dele.
   */
  definition: MetricDefinition
  /**
   * O número já formatado, ou `null` quando NÃO HÁ valor. Passar `null` é o caminho
   * obrigatório para a ausência — nunca `0`, nunca `'—'`. `0%` é um desempenho ruim;
   * ausência de medição não é desempenho nenhum.
   */
  value: ReactNode | null
  /** Variação contextual do placeholder. */
  emptyLabel?: string
  hint?: ReactNode
  tone?: KpiTone
}

function Header({ label, definition }: { label: string; definition: MetricDefinition }) {
  return (
    <span className="flex items-start justify-between gap-2">
      <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.08em]">{label}</span>
      <MetricInfoPopover definition={definition} />
    </span>
  )
}

/**
 * Uma CÉLULA de KPI: rótulo, o ⓘ que explica o número, o número e uma legenda opcional.
 *
 * **Não é um `<Card>`.** Quem desenha a moldura é o `KpiCardGrid`, que envolve a fileira
 * inteira num cartão só e separa as células por um vão de 1px sobre `bg-border`. Se cada
 * célula trouxesse a própria borda, dois vizinhos desenhariam duas linhas coladas.
 *
 * Daí o `bg-card` aqui: é ele que cobre o fundo do container e deixa o traço aparecer só no
 * vão. **PROIBIDO usar fora de um `KpiCardGrid`** — sem a moldura, a célula fica sem borda e
 * sem raio. Para o número que ancora um gráfico, use `KpiHeadline`.
 */
export function KpiCard({ label, definition, value, emptyLabel, hint, tone = 'default' }: KpiCardProps) {
  return (
    <div data-slot="kpi-card" className="flex flex-col gap-1 bg-card p-4">
      <Header label={label} definition={definition} />
      <KpiValue tone={tone} emptyLabel={emptyLabel}>
        {value}
      </KpiValue>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

/**
 * O mesmo miolo, sem o espaçamento de célula. Existe para os lugares em que o número ancora
 * outra coisa — o topo de um gráfico — e onde, portanto, não há grade. É ele que evita as
 * duas saídas erradas: um `KpiCard` solto fora do grid, ou um `KpiCard` com o próprio
 * padding desfeito por `className`.
 */
export function KpiHeadline({ label, definition, value, emptyLabel, hint, tone = 'default', className }: KpiCardProps & { className?: string }) {
  return (
    <span className={cn('flex flex-col gap-1', className)}>
      <Header label={label} definition={definition} />
      <KpiValue tone={tone} emptyLabel={emptyLabel}>
        {value}
      </KpiValue>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </span>
  )
}
