import type { Plan } from '@wlet/domain'
import { z } from 'zod'

/**
 * A escolha da compra que o plano virou — um campo só, e ainda assim formulário (`forms.md` §1).
 *
 * O valor é o id de UMA parcela da compra; o diálogo guarda o da parcela mais antiga visível. A saída é
 * declarada no tipo do domínio, que é o que o sensor `form-domain-link` exige.
 */
export const purchaseLinkSchema = z.object({ purchaseId: z.string().min(1, 'Escolha uma compra.') }).transform((values): Required<Pick<Plan, 'purchaseId'>> => ({ purchaseId: values.purchaseId }))

export type PurchaseLinkFormValues = z.input<typeof purchaseLinkSchema>
