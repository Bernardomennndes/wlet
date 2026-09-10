import type { BudgetCategory, BudgetItem } from '@/data/types'

/**
 * Quanto uma rubrica vale — a ÚNICA resposta a essa pergunta no app inteiro.
 *
 * Uma rubrica pode ser um número digitado ou uma composição de itens (`quantity` ×
 * `unitAmount`). Quem tem itens é medido por eles; quem não tem, pelo `amount`. Nunca pelos
 * dois: guardar um total ao lado da composição que o gera é criar duas somas para a mesma
 * grandeza, e elas divergem no primeiro item editado — foi exatamente assim que a tela de
 * Previsão já produziu um terceiro número para um mês que só devia ter um.
 *
 * O módulo é PURO e separado de `src/lib/budget.ts` por uma razão dura: aquele lê
 * `declarations()` na avaliação, então importá-lo acorda o portão de boot. O serviço de
 * configuração precisa desta conta para validar e normalizar o que grava, e não pode tocar o
 * portão — `scripts/checks/services-boot.test.ts` falharia, e no navegador o sintoma seria
 * uma página em branco.
 */
export function itemAmount(item: BudgetItem): number {
  return item.quantity * item.unitAmount
}

export function rubricAmount(rubric: BudgetCategory): number {
  if (!rubric.items?.length) return rubric.amount
  return rubric.items.reduce((total, item) => total + itemAmount(item), 0)
}

/** Se o valor é composto — o que decide se a tela mostra a lista ou o campo único. */
export function hasComposition(rubric: BudgetCategory): boolean {
  return Boolean(rubric.items?.length)
}
