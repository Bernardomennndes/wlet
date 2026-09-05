import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { kpiToneClasses, type KpiTone } from './kpi-tone'

/**
 * As três medidas de cada tamanho, e por que são TRÊS.
 *
 * `value` e `empty` divergem de propósito — ausência não veste a tipografia de um número —,
 * e é essa divergência que cria o problema que `box` resolve: com fontes diferentes, a caixa
 * de linha do valor e a do placeholder têm alturas diferentes, e um cartão "Não informado"
 * fica mais BAIXO que os vizinhos. `box` fixa a mesma altura de linha nos dois ramos.
 */
const sizeClasses = {
  /** Cartão avulso e cartão herói. */
  default: { value: 'font-bold text-3xl', empty: 'text-lg', box: 'leading-9' },
  /** Célula da grade densa: vários números numa linha só. */
  compact: { value: 'font-semibold text-xl tracking-tight', empty: 'text-sm', box: 'leading-7' },
} as const

/**
 * O número em si, compartilhado por todos os shells de KPI — e, mais importante, o único
 * lugar que decide como um KPI SEM valor se parece.
 *
 * A ausência mora aqui em vez de em cada tela porque o atalho tentador é local e invisível:
 * uma tela que transforma `null` em `0` lê como uma medição real de zero, e quem revisa não
 * distingue de uma tela onde o zero foi medido.
 *
 * O placeholder é o itálico + muted de `empty-cells.md` §1b, escrito aqui e não delegado ao
 * `<NotInformed>`: aquele componente fixa `text-sm`, e §1b nomeia os cartões de resumo como
 * a exceção justamente porque o placeholder precisa herdar a escala do próprio bloco.
 */
export function KpiValue({
  children,
  tone = 'default',
  size = 'default',
  emptyLabel = 'Não informado',
}: {
  children: ReactNode | null
  tone?: KpiTone
  size?: keyof typeof sizeClasses
  emptyLabel?: string
}) {
  const scale = sizeClasses[size]

  // `== null` de propósito: pega `null` (o "não medido" explícito) e `undefined`.
  if (children == null) {
    return <span className={cn('font-normal text-muted-foreground italic', scale.empty, scale.box)}>{emptyLabel}</span>
  }

  return <span className={cn('font-mono tabular-nums', scale.value, scale.box, kpiToneClasses[tone])}>{children}</span>
}
