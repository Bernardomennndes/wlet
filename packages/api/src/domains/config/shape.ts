import { z } from 'zod'
import { entity, month, regexWire } from '../../shared/shape'

const dueOn = z.union([z.object({ kind: z.literal('day'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('business-day'), nth: z.number().int().min(1).max(23) })])

const matchRule = z.object({ merchants: z.array(z.string()), accountId: z.string().optional(), amountBetween: z.tuple([z.number(), z.number()]).optional() })

export const plannedEntry = z.object({
  id: z.string(),
  kind: z.enum(['income', 'expense']),
  label: z.string(),
  amount: z.number(),
  categoryId: z.string(),
  entity,
  recurrence: z.enum(['monthly', 'once', 'installments']),
  startMonth: month,
  dueOn: dueOn.optional(),
  count: z.number().int().optional(),
  endMonth: month.optional(),
  exceptions: z.record(z.string(), z.number()).optional(),
  match: matchRule.optional(),
})

export const receivable = z.object({
  id: z.string(),
  label: z.string(),
  debtor: z.string(),
  amount: z.number(),
  entity,
  dueOn,
  recurrence: z.enum(['monthly', 'once', 'installments']),
  startMonth: month,
  endMonth: month.optional(),
  count: z.number().int().optional(),
  match: matchRule,
  offsetsCategoryId: z.string(),
  accountId: z.string().optional(),
})

export const budgetItem = z.object({
  label: z.string(),
  quantity: z.number(),
  unitAmount: z.number(),
  unit: z.string().optional(),
  cadence: z.enum(['day', 'week', 'month']).optional(),
})

export const budget = z.object({
  monthlyLimit: z.number(),
  warnAt: z.number(),
  byCategory: z.array(z.object({ categoryId: z.string(), amount: z.number(), items: z.array(budgetItem).optional() })).optional(),
})

export const goal = z.object({ id: z.string(), label: z.string(), saved: z.number(), target: z.number(), /** O mês em que se quer chegar lá. */ targetMonth: month, slot: z.number().int() })

/**
 * O perfil de uma conta: é ele que faz um arquivo ser reconhecido como desta conta, e não de
 * outra. `match.externalId` aceita `RegExp` no domínio — daí o `union` com `regexWire`.
 */
export const accountProfile = z.object({
  id: z.string(),
  name: z.string(),
  bank: z.string(),
  bankCode: z.string(),
  type: z.enum(['checking', 'credit-card', 'investment']),
  entity,
  holder: z.string(),
  match: z.object({
    bankCode: z.string().optional(),
    externalId: z.union([z.string(), regexWire]).optional(),
    accountType: z.enum(['checking', 'credit-card', 'investment']).optional(),
    pathIncludes: z.string().optional(),
  }),
})

/** A regra de categoria, com o `test` no formato do fio — ver `regexWire`. */
export const rule = z.object({ id: z.string(), test: regexWire, category: z.string(), merchant: z.string().optional(), sign: z.enum(['in', 'out']).optional() })

/**
 * As SETE declarações, num agregado só.
 *
 * É exatamente a forma que o pipeline recebe, e a identidade não é conveniência: enquanto eram
 * dois tipos, o app carregava uma cópia de cada e editar a configuração não mudava tela nenhuma.
 */
export const declarations = z.object({
  accounts: z.array(accountProfile),
  selfNamePatterns: z.array(regexWire),
  rules: z.array(rule),
  planned: z.array(plannedEntry),
  receivables: z.array(receivable),
  budget,
  goals: z.array(goal),
})

export type DeclarationsResponse = z.infer<typeof declarations>
