import { z } from 'zod'
import { budgetCadences, type BudgetCadence, type BudgetItem } from '@wlet/domain'

/**
 * Os valores aceitos saem da lista do DOMÍNIO, nunca de um `z.enum` redigitado aqui — é a §3 da
 * `forms.md`. E é ele que apagou o `cadence as BudgetCadence` que a linha carregava: o combobox
 * devolve `string`, e quem promete que a string é uma cadência é o schema, não uma asserção.
 */
const CADENCE_VALUES = budgetCadences.map((cadence) => cadence.value) as [BudgetCadence, ...BudgetCadence[]]

/**
 * O item da composição, como o formulário o coleta.
 *
 * **O nome NÃO é obrigatório**, e isso é decisão de desenho e não esquecimento: o item nasce vazio
 * de propósito (ver o "Adicionar item" da lista), e exigir nome no commit faria a quantidade e o
 * preço de um item recém-criado não gravarem enquanto ninguém o batizasse — uma recusa silenciosa,
 * que é pior que o campo em branco. O que o schema prende é o que não tem leitura possível:
 * quantidade e preço negativos.
 *
 * Mora num `.ts` irmão para poder ser testado sem montar React (`form-output-contract.md` §1.1) — e
 * o teste existe sobretudo para a decisão acima: alguém "consertando" o nome para obrigatório
 * quebra a suíte em vez de quebrar a tela em silêncio.
 */
export const rubricItemSchema = z
  .object({
    label: z.string(),
    quantity: z.number().min(0, 'A quantidade não pode ser negativa.'),
    /** Texto livre — ver `BudgetItem.unit`; uma lista fechada obrigaria a mentir sobre a compra. */
    unit: z.string(),
    cadence: z.enum(CADENCE_VALUES),
    unitAmount: z.number().min(0, 'O preço unitário não pode ser negativo.'),
  })
  /**
   * A SAÍDA já é o `BudgetItem` — o formulário não tem adaptador na frente.
   *
   * A conversão de `unit` vivia no `handleSubmit` do `.tsx`, e o custo não era a indireção: o tipo
   * inferido do schema NÃO era o payload, então esta regra — vazio SOME em vez de virar `''` —
   * ficava fora do alcance do teste de `parse`, e prová-la exigiria montar a tela. O teste
   * afirmava que `unit: ''` passa na validação, que é outra coisa. É a mesma correção que
   * `plan-sheet-schema.ts` já tinha feito (`form-output-contract.md` §2.1).
   *
   * Por que `undefined` e não `''`: o campo é opcional no domínio, e uma string vazia gravada é um
   * dado que ninguém informou se passando por informado.
   */
  .transform(
    (values): BudgetItem => ({
      label: values.label,
      quantity: values.quantity,
      unitAmount: values.unitAmount,
      unit: values.unit.trim() || undefined,
      cadence: values.cadence,
    }),
  )

/** O que os CAMPOS guardam — a entrada do schema, antes da conversão. */
export type RubricItemFormValues = z.input<typeof rubricItemSchema>

/** O teto de uma rubrica simples, sem composição: um número, que não pode ser negativo. */
export const rubricAmountSchema = z.object({ amount: z.number().min(0, 'O planejado não pode ser negativo.') })

export type RubricAmountFormValues = z.infer<typeof rubricAmountSchema>
