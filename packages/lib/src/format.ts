const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
// `minimumFractionDigits: 0` não é redundante com o máximo: no ICU do Node 22, `maximumFractionDigits: 1`
// sozinho MANTÉM o zero à direita e imprime "R$ 22,0 mil"; no do Node 26 ele o descarta. Declarar o
// mínimo fixa a saída nas duas — e "R$ 22 mil" é o que o docblock de `formatAxis` documenta.
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })

export function formatBRL(value: number): string {
  return brl.format(value)
}

export function formatBRLCompact(value: number): string {
  return Math.abs(value) >= 10_000 ? brlCompact.format(value) : brl.format(value)
}

const brlAxis = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 })

/** Rótulo curto para eixos: "R$ 5,5 mil", "R$ 22 mil", "R$ 0". */
export function formatAxis(value: number): string {
  if (value === 0) return 'R$ 0'
  return brlAxis.format(value)
}

export function formatSigned(value: number): string {
  const text = brl.format(Math.abs(value))
  return value < 0 ? `− ${text}` : `+ ${text}`
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function capitalizeFirst(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/**
 * "2026-03" → "Mar 26". Formato de rótulo: eixo dos gráficos, seletores de período e
 * cabeçalhos de tabela. Inicial maiúscula porque é rótulo, não texto corrido — em
 * português o mês só é maiúsculo nessa posição.
 */
export function formatMonthShort(month: string): string {
  return `${capitalizeFirst(MONTHS_SHORT[Number(month.split('-')[1]) - 1])} ${month.slice(2, 4)}`
}

/**
 * "2026-03" → "março de 2026". Minúsculo porque esta forma vive em TEXTO CORRIDO — "de
 * janeiro de 2026 a setembro de 2026", "Lançamentos de março de 2026". Em rótulo, use
 * `formatMonthLongLabel`.
 */
export function formatMonthLong(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTHS_LONG[Number(m) - 1]} de ${y}`
}

/**
 * "2026-03" → "Março de 2026". A mesma regra do `formatMonthShort`: o mês é maiúsculo
 * quando é RÓTULO — título de item, célula de tabela, título de tooltip —, porque ali ele
 * não está dentro de uma frase.
 */
export function formatMonthLongLabel(month: string): string {
  return capitalizeFirst(formatMonthLong(month))
}

/** "2026-03-09" → "09/03/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "2026-03-09" → "09 mar" */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d} ${MONTHS_SHORT[Number(m) - 1]}`
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`
}

/**
 * Só a palavra, nunca o número: `${n} ${plural(n, 'lançamento', 'lançamentos')}`. Devolver a
 * frase montada obrigaria um segundo argumento para cada variação de formato do número.
 */
export function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}
