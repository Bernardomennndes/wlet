import { Lock, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Badge } from '@wlet/ui/components/badge'
import { cn } from '@wlet/lib/utils'

/**
 * Estabilidade de um gasto recorrente, derivada do desvio entre as cobranças. É estado de
 * UMA tela, então mora aqui e não em `src/components/` — mas segue a forma dos demais
 * badges: `outline`, ícone de prefixo e o mapa fora do render.
 *
 * O prefixo não é enfeite: cor e texto sozinhos não distinguem o estado para quem não
 * enxerga a diferença de matiz.
 */
const FIXED: { label: string; Icon: PhosphorIcon; className: string } = {
  label: 'valor fixo',
  Icon: Lock,
  className: 'border-muted-foreground/40 text-muted-foreground',
}

/** Abaixo deste desvio relativo a cobrança repete o mesmo valor todo mês. */
const FIXED_THRESHOLD = 0.15

export function VariabilityBadge({ variability, className }: { variability: number; className?: string }) {
  if (variability >= FIXED_THRESHOLD) return null
  const { label, Icon, className: tone } = FIXED
  return (
    <Badge variant="outline" className={cn(tone, className)}>
      <Icon data-icon="inline-start" aria-hidden />
      {label}
    </Badge>
  )
}
