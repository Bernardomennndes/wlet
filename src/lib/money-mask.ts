/**
 * A máscara de dinheiro: o que se digita são CENTAVOS, da direita para a esquerda.
 *
 * É a convenção de todo aplicativo de banco brasileiro, e ela existe porque a alternativa —
 * um campo livre onde a pessoa escreve "3000" ou "3.000,00" ou "3000,00" — obriga o programa a
 * adivinhar se o ponto é milhar ou decimal. Aqui não há o que adivinhar: só os DÍGITOS contam,
 * e os dois últimos são os centavos. Digitar 3, 0, 0, 0, 0, 0 sobe por 0,03 → 0,30 → 3,00 →
 * 30,00 → 300,00 → 3.000,00, e apagar desce pelo mesmo caminho.
 *
 * O módulo é puro e sem import de propósito: ele é o par de funções em que um erro passaria
 * despercebido — um deslocamento de casa não quebra nada, só grava o valor errado — e é isso
 * que o torna candidato a teste, como `business-days` e `settlement`.
 */

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Quinze dígitos é o teto, e ele não é estético: `Number.MAX_SAFE_INTEGER` é ~9,007 × 10¹⁵,
 * então dezesseis dígitos de centavo passariam a somar errado em silêncio.
 */
const MAX_DIGITS = 15

/** Lê o número a partir do que está escrito no campo — "1.234,50" e "123450" dão o mesmo. */
export function parseMoney(text: string): number {
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS)
  return digits === '' ? 0 : Number(digits) / 100
}

/**
 * Escreve o número no campo, SEM o "R$" — o símbolo é um adorno do `InputGroup`, e repeti-lo
 * aqui o faria aparecer duas vezes.
 *
 * Zero sai como campo VAZIO, não como "0,00": um zero impresso pareceria um preço já informado,
 * e é justamente o valor que a validação recusa.
 */
export function maskMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return decimal.format(value)
}
