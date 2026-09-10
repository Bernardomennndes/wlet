import type { BudgetCategory, BudgetItem, Flow } from '@/data/types'

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

/**
 * O mínimo que a conta do gasto precisa saber de uma transação.
 *
 * Declarado por FORMA em vez de importar `ViewTransaction`: aquele tipo mora em
 * `src/lib/finance.ts`, que lê `declarations()` na avaliação, e este módulo é justamente o
 * que precisa continuar puro para o serviço de configuração usá-lo. `ViewTransaction`
 * satisfaz esta forma, então a tela passa a lista dela direto.
 */
export interface RubricSpending {
  month: string
  displayCategoryId: string
  flow: Flow
  amount: number
}

/**
 * Quanto saiu de uma categoria num mês, LÍQUIDO de reembolso.
 *
 * O reembolso entra com sinal invertido porque ele é despesa negativa — pagar o aluguel
 * inteiro e receber metade de volta deixa a moradia pelo custo real, e a rubrica tem de medir
 * o mesmo número que o resto do app. Trava em zero pela razão de `summarizeByCategory`: um
 * rateio que chega num mês sem a despesa correspondente deixaria a categoria negativa, e
 * "gastei menos zero" não é leitura que uma barra saiba desenhar.
 */
export function rubricSpent(history: readonly RubricSpending[], month: string, categoryId: string): number {
  let total = 0
  for (const tx of history) {
    if (tx.month !== month || tx.displayCategoryId !== categoryId) continue
    if (tx.flow === 'expense') total += Math.abs(tx.amount)
    else if (tx.flow === 'reimbursement') total -= Math.abs(tx.amount)
  }
  return Math.max(0, total)
}
