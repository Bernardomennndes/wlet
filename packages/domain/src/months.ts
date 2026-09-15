/**
 * Aritmética de mês AAAA-MM, sem passar por `Date` — para não pegar fuso.
 *
 * Mora aqui, e não em `plans.ts`, porque duas partes do domínio precisam dela: a agenda dos planos e
 * as compras parceladas. `finance.ts` tem um `shiftMonth` idêntico, e ele não é importado de propósito:
 * aquele arquivo carrega o conjunto no topo, e o domínio é lido pelos testes sem portão de boot.
 */
export function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Quantos meses vão de `a` até `b` (positivo quando `b` vem depois). */
export function monthsApart(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return yb * 12 + mb - (ya * 12 + ma)
}
