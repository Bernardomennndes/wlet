import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ausência de informação, num lugar só. Itálico e esmaecido para não competir com dado
 * real, e texto em vez de travessão porque "—" não é lido por leitor de tela nem
 * distingue "não informado" de "zero".
 *
 * O `className` fica reservado a fluxo e layout (`whitespace-nowrap`, alinhamento); a
 * tipografia é do componente, senão cada tela reinventa a sua e elas divergem.
 */
export function NotInformed({ children = 'Não informado', className }: { children?: ReactNode; className?: string }) {
  return <span className={cn('text-muted-foreground italic', className)}>{children}</span>
}
