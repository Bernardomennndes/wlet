/**
 * O `toast()` mora aqui e não ao lado do `Toaster` de propósito.
 *
 * Um arquivo que exporta componente E função perde o fast refresh do React inteiro — ao editá-lo,
 * o Vite recarrega a página em vez de trocar o componente no lugar. É o mesmo motivo pelo qual os
 * arquivos do registry que exportam uma `variants` ao lado do componente aparecem no lint.
 *
 * Reexportado, e não embrulhado: um embrulho só conseguiria dar mensagem genérica, e a regra de
 * escrita exige que o texto nomeie o que aconteceu — quem sabe isso é o ponto de uso.
 */
export { toast } from 'sonner'
