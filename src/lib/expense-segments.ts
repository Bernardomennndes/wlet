import { hatchBackground } from '@/components/charts/chart-theme'
import { categoryColor, INCOME_VAR, OTHER_VAR } from '@/lib/chart-tokens'

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
  /**
   * A cor CRUA da série, sem textura. A marca prevista é desenhada como contorno, e um
   * contorno não pode ser pintado com um gradiente listrado — mas a identidade da categoria
   * tem que sobreviver, então ela vem daqui.
   */
  color: string
  /** De que lado do movimento a fatia está. Decide a textura da marca e do traço. */
  flow: 'income' | 'expense'
}

/**
 * As maiores categorias de saída mais o restante, prontas para desenhar.
 *
 * O resto NÃO é opcional: sem ele a soma das fatias não fecha o total, e a barra encolhe
 * mentindo sobre a proporção do que ela representa. É a mesma política em todas as barras
 * de volume — Visão geral e Previsão —, e mora aqui para não haver duas versões dela com
 * arredondamentos diferentes.
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
    color: categoryColor(segment.categoryId),
    flow: 'expense',
  }))
  if (rest > 0.005) parts.push({ key: '__outras', label: 'Outras saídas', value: rest, background: hatchBackground(OTHER_VAR), color: OTHER_VAR, flow: 'expense' })
  return parts
}

/**
 * O volume de um mês repartido: entrada como bloco sólido, saída fatiada nas maiores
 * categorias. O denominador é entrada + saída, não a entrada — é por isso que a barra
 * responde "quanto do movimento foi o quê" e não "as saídas passaram das entradas?",
 * que é a leitura da porcentagem no cabeçalho.
 */
export function splitVolume(income: number, expense: number, segments: ExpenseSegment[]): VolumeParts {
  return {
    total: income + expense,
    // Entrada sólida, saída hachurada: a mesma distinção do gráfico, então a textura
    // sozinha já diz de que lado do movimento a fatia é.
    income: income > 0 ? { key: '__entradas', label: 'Entradas', value: income, background: INCOME_VAR, color: INCOME_VAR, flow: 'income' } : null,
    expense: splitExpense(segments, expense),
  }
}

export interface VolumeParts {
  total: number
  income: SegmentPart | null
  expense: SegmentPart[]
}
