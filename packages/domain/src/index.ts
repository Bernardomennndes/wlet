/**
 * O vocabulário de domínio do WLET: os tipos, as listas de enum e o catálogo de categorias.
 *
 * É o pacote da BASE da pilha — ele não conhece armazenamento, nem rede, nem tela. Todo o resto
 * depende dele e ele não depende de ninguém, fora os ícones que as listas de enum carregam
 * (`EnumOption.icon`), que são apresentação inseparável do valor: é a §1 da `enum-display`, que
 * manda as três faces de um enum morarem juntas.
 */
export * from './types'
export * from './categories'
