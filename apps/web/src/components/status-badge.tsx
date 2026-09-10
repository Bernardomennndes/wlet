import { CalendarDot, FileX, LinkBreak, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export type Status = 'previsao' | 'sem-contraparte' | 'duplicado'

/**
 * Status leva borda + ícone + texto, sem fundo: o `Badge` do registry pinta `bg-input/20`
 * mesmo em `outline`, então este componente é markup próprio em vez de uma variante dele.
 * `duplicado` é estado inerte (o arquivo repetido foi ignorado de propósito), não erro —
 * por isso cinza, e não a cor de alerta dos outros dois.
 */
const STATUS: Record<Status, { label: string; Icon: PhosphorIcon; className: string }> = {
  previsao: { label: 'Previsão', Icon: CalendarDot, className: 'border-[var(--status-warning)]/40 text-[var(--status-warning)]' },
  'sem-contraparte': { label: 'Sem contraparte', Icon: LinkBreak, className: 'border-[var(--status-warning)]/40 text-[var(--status-warning)]' },
  duplicado: { label: 'Duplicado, ignorado', Icon: FileX, className: 'border-muted-foreground/40 text-muted-foreground' },
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { label, Icon, className: tone } = STATUS[status]
  return (
    <span className={cn('inline-flex h-5 items-center rounded-md border text-xs', tone, className)}>
      <span className="flex h-full items-center justify-center border-inherit border-r px-0.5">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="px-1 font-medium">{label}</span>
    </span>
  )
}
