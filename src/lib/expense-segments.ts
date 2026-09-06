import { hatchBackground } from '@/components/charts/chart-theme'
import { categoryColor, OTHER_VAR } from '@/lib/chart-tokens'

/** Uma categoria de saída, já somada no recorte de tempo de quem chama. */
export interface ExpenseSegment {
  categoryId: string
  label: string
  value: number
}

/** Quantas categorias uma barra nomeia; o resto vira uma fatia só. */
export const MAX_SEGMENTS = 3

export interface SegmentPart {
  key: string
  label: string
  value: number
  /** `background` já resolvido: a cor da categoria, hachurada porque é saída. */
  background: string
}

/**
 * As maiores categorias de saída mais o restante, prontas para desenhar.
 *
 * O resto NÃO é opcional: sem ele a soma das fatias não fecha o total, e a barra encolhe
 * mentindo sobre a proporção do que ela representa. É a mesma política nas duas barras da
 * Visão geral, e mora aqui para não haver duas versões dela com arredondamentos diferentes.
 */
export function splitExpense(segments: ExpenseSegment[], total: number): SegmentPart[] {
  const top = segments.filter((segment) => segment.value > 0).slice(0, MAX_SEGMENTS)
  const named = top.reduce((acc, segment) => acc + segment.value, 0)
  const rest = total - named
  const parts: SegmentPart[] = top.map((segment) => ({
    key: segment.categoryId,
    label: segment.label,
    value: segment.value,
    background: hatchBackground(categoryColor(segment.categoryId)),
  }))
  if (rest > 0.005) parts.push({ key: '__outras', label: 'Outras saídas', value: rest, background: hatchBackground(OTHER_VAR) })
  return parts
}
