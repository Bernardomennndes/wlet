import { z } from 'zod'
import { isInstallmentCount } from '@wlet/domain/plans'
import { paymentModes, planStatuses, type PaymentMode, type Plan, type PlanStatus } from '@wlet/domain'

/**
 * O schema do formulário de plano — extraído do componente para poder ser TESTADO.
 *
 * A `form-output-contract.md` §1.1 diz onde a maior parte dos casos de saída deve viver: num teste
 * de `parse`, que é função de objeto para objeto e não paga DOM por nada. Enquanto o schema era um
 * `const` privado dentro do `.tsx`, esse teste não existia — e as regras abaixo são justamente as
 * que já custaram bug neste projeto.
 *
 * Mora num `.ts` irmão e não exportado do `.tsx` por uma razão a mais: exportar algo que não é
 * componente de um arquivo de componente custa o fast refresh do React inteiro.
 */

/** O par de preços vira o bloco `financed` do plano — ou some, quando não há pesquisa parcelada. */
export function financedOf(values: { financedTotal: number; installments: number }) {
  return values.financedTotal > 0 && isInstallmentCount(values.installments) ? { total: values.financedTotal, installments: values.installments } : undefined
}

// Os valores do schema saem das listas de enum do domínio, nunca de um `z.enum` redigitado:
// um estado novo em `planStatuses` tem de ser erro de compilação aqui, não uma opção que o
// formulário aceita e a leitura rejeita.
const STATUS_VALUES = planStatuses.map((s) => s.value) as [PlanStatus, ...PlanStatus[]]
const PAYMENT_VALUES = paymentModes.map((m) => m.value) as [PaymentMode, ...PaymentMode[]]

const schema = z
  .object({
    label: z.string().trim().min(1, 'Dê um nome ao plano.'),
    cash: z.number().positive('Informe o preço à vista.'),
    financedTotal: z.number().nonnegative('O preço parcelado não pode ser negativo.'),
    installments: z.number(),
    // Os três campos abaixo aceitam AUSÊNCIA, que quer dizer "ainda não decidi". Não é o mesmo
    // que um valor padrão: um plano recém-anotado não escolheu forma de pagamento nem data, e
    // preencher por ele afirmaria uma decisão que não houve.
    //
    // A ausência se escreve `null`, não string vazia (`forms.md` §3). Com `''` no schema, o
    // tipo dizia `PaymentMode | ''` e cada leitor tinha de saber que aquela string vazia
    // significava "nenhum" — e era isso que obrigava um `|| undefined` campo a campo na hora
    // de gravar. Os controles convertem nos dois sentidos (`value={field.value ?? ''}`), que é
    // onde essa tradução pertence: no input, que não sabe dizer null.
    payment: z.enum(PAYMENT_VALUES).nullish(),
    categoryId: z.string().min(1, 'Escolha uma categoria.'),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Escolha um mês válido.')
      .nullish(),
    groupId: z.string().nullish(),
    status: z.enum(STATUS_VALUES),
  })
  // As parcelas só são cobradas quando existe preço parcelado. O bloco inteiro é opcional, e
  // exigir "2 a 99" de quem deixou tudo em branco transformaria a opção numa obrigação.
  .superRefine((values, ctx) => {
    if (values.financedTotal > 0 && !isInstallmentCount(values.installments)) {
      ctx.addIssue({ code: 'custom', path: ['installments'], message: 'Parcelado vai de 2 a 99 vezes.' })
    }
  })
  /**
   * A SAÍDA do schema já é o plano — o formulário não tem adaptador na frente.
   *
   * Era uma função `toPlan` chamada dentro do `handleSubmit`, e o custo dela não era a
   * indireção: era que o tipo inferido do schema NÃO era o payload, então provar a saída
   * exigiria montar a tela. Com a conversão aqui, `z.output<typeof schema>` é
   * `Omit<Plan, 'id'>` e o compilador prende os dois — trocar um campo do plano quebra o
   * schema (`form-output-contract.md` §1.1).
   */
  .transform((values): Omit<Plan, 'id'> => {
    const financed = financedOf(values)
    return {
      label: values.label,
      cash: values.cash,
      financed,
      // Escolher parcelado e depois apagar o preço deixaria um estado que não se pode
      // desenhar: ele volta a ser "não decidido", não "à vista".
      payment: values.payment === 'financed' && !financed ? undefined : (values.payment ?? undefined),
      categoryId: values.categoryId,
      month: values.month ?? undefined,
      groupId: values.groupId ?? undefined,
      status: values.status,
    }
  })

/** O que os CAMPOS guardam — a entrada do schema, antes da conversão. */
export type PlanFormValues = z.input<typeof schema>

export { schema as planFormSchema }
