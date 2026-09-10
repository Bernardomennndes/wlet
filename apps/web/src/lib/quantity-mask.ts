/**
 * A leitura e a escrita de uma QUANTIDADE no campo — irmã de `money-mask`, com regra oposta.
 *
 * Dinheiro se digita em centavos, da direita para a esquerda, porque toda casa decimal existe
 * sempre. Quantidade não: "2" é dois, não dois centésimos, e a mesma máscara escreveria 0,02
 * para quem digitou 2. Aqui os dígitos valem pelo que são e o separador é explícito.
 *
 * **Vírgula E ponto são aceitos como decimal.** Em português se digita vírgula, e o teclado
 * numérico do celular manda ponto — recusar qualquer um dos dois faz o campo ignorar a tecla
 * sem dizer por quê, que é exatamente o defeito que o `MoneyInput` existe para não repetir.
 *
 * **Não há separador de MILHAR**, nem na leitura nem na escrita, e isso é deliberado: com ele,
 * "1.000" seria ambíguo entre mil e um inteiro, e nenhuma quantidade mensal de item de dieta
 * chega à casa do milhar. Sem ele a regra é simples — o último separador é o decimal.
 *
 * O módulo é puro e sem import, como `money-mask` e `business-days`: um deslocamento de casa
 * aqui não quebra nada, só grava o número errado, e é isso que o torna candidato a teste.
 */

/** Três casas bastam: meio quilo, um quarto de pote. Além disso é ruído de digitação. */
const MAX_FRACTION_DIGITS = 3

/** Lê o número a partir do que está escrito — "0,5" e "0.5" dão o mesmo. */
export function parseQuantity(text: string): number {
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (cleaned === '') return 0
  const separator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'))
  if (separator === -1) return Number(cleaned) || 0
  const whole = cleaned.slice(0, separator).replace(/[.,]/g, '') || '0'
  const fraction = cleaned
    .slice(separator + 1)
    .replace(/[.,]/g, '')
    .slice(0, MAX_FRACTION_DIGITS)
  return Number(`${whole}.${fraction || '0'}`) || 0
}

/**
 * Escreve o número no campo.
 *
 * Zero sai VAZIO pela mesma razão do `maskMoney`: um zero impresso pareceria uma quantidade já
 * informada, e é justamente o valor que a validação recusa.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: MAX_FRACTION_DIGITS, useGrouping: false }).format(value)
}
