/**
 * Normaliza texto para BUSCA: sem acento e sem caixa.
 *
 * Em português, quem digita "alimentacao" está procurando "Alimentação", e quem digita "MERCADO"
 * está procurando "Mercado". Um filtro que compara as strings cruas não acha nenhum dos dois.
 *
 * Mora aqui, e não dentro do componente que a usa, porque tem dois consumidores — o seletor
 * genérico (`AppCombobox`) e o de adicionar rubrica — e duas cópias de uma regra de busca
 * divergem na primeira vez que alguém afinar uma só. Não é formatação: `format.ts` existe para
 * o que a pessoa LÊ, e isto é para o que o código COMPARA.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
