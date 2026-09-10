import { z } from 'zod'
import { month } from '../../shared/shape'

export const planGroup = z.object({ id: z.string(), label: z.string() })

/**
 * Um plano guarda DOIS preços, e só um vale.
 *
 * À vista e parcelado são pesquisa de preço, não estados alternativos: a loja cobra R$ 3.000 à
 * vista e R$ 3.400 em 10×, e a diferença fica escrita em vez de estimada. Quem decide o que a
 * previsão usa é `payment` — e ele aceita ausência, porque um plano recém-anotado não escolheu.
 */
export const plan = z.object({
  id: z.string(),
  label: z.string(),
  categoryId: z.string(),
  cash: z.number(),
  financed: z.object({ total: z.number(), installments: z.number().int() }).optional(),
  payment: z.enum(['cash', 'financed']).optional(),
  month: month.optional(),
  groupId: z.string().optional(),
  status: z.enum(['decided', 'considering', 'discarded']),
})

export const plansData = z.object({ groups: z.array(planGroup), items: z.array(plan) })

export type PlanResponse = z.infer<typeof plan>
