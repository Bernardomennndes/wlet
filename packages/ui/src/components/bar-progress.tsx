import type { CSSProperties, ReactNode } from 'react'
import { Progress } from './progress'
import { cn } from '@wlet/lib/utils'

/**
 * A variante "barra de ranking" do `Progress`: trilho fino, cantos retos e a cor do
 * indicador vinda de `--bar-color`.
 *
 * A regra manda declarar isto como variante do próprio componente. Como o `progress.tsx`
 * é arquivo do registry — reescrito no próximo `shadcn add` —, a variante mora aqui, no
 * mesmo lugar em que `app-select` e `month-picker` compõem sobre o registry. O que
 * importa é o efeito: nenhuma tela carrega `h-*` ou `bg-*` do Progress no call site.
 */
const BAR =
  'w-full gap-x-3 gap-y-1 ' +
  '[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:rounded-sm ' +
  '[&_[data-slot=progress-track]]:bg-[var(--chart-track)] ' +
  '[&_[data-slot=progress-indicator]]:rounded-sm [&_[data-slot=progress-indicator]]:min-w-0.5 ' +
  '[&_[data-slot=progress-indicator]]:bg-[var(--bar-color)]'

export function BarProgress({
  value,
  max,
  color,
  getAriaValueText,
  children,
  className,
}: {
  value: number
  max: number
  /** Cor do indicador. É dado — o slot da categoria, a leitura do número —, não estilo. */
  color?: string
  getAriaValueText?: () => string
  children: ReactNode
  className?: string
}) {
  return (
    <Progress value={value} max={max} getAriaValueText={getAriaValueText} className={cn(BAR, className)} style={{ '--bar-color': color ?? 'var(--series-1)' } as CSSProperties}>
      {children}
    </Progress>
  )
}
