/**
 * Um id novo, único mesmo dentro do mesmo milissegundo.
 *
 * O relógio sozinho NÃO basta, e isso foi medido duas vezes neste projeto: 200 ids gerados no mesmo
 * tique com `Date.now()` puro davam UM id distinto e 199 colisões. O sufixo aleatório é o que separa
 * dois itens criados no mesmo laço.
 *
 * **O contador da lista também não basta**, e é a segunda armadilha. `conta-${lista.length + 1}`
 * parece seguro e não é: acrescentar três, remover o do meio e acrescentar de novo devolve o id do
 * terceiro — medido. Dois itens com o mesmo id é edição que muda os dois e remoção que apaga os
 * dois, e onde não há validação isso acontece em silêncio.
 *
 * Onde o id precisa entrar numa PORTA (o caso do catálogo de planos), ele não é importado direto:
 * `Date.now()` e `Math.random()` são o mundo de fora, e um teste que não os controla não consegue
 * afirmar nada sobre o que foi gravado. Ver `IdGenerator` em `@wlet/services`.
 */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
