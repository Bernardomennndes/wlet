import { z } from 'zod'
import { entity, month, regexWire } from '../../shared/shape'

/**
 * A origem NÃO publica schema nomeado — e é por isso que os nomes daqui são nossos.
 *
 * Quem serve estas rotas é o `apps/api` desta mesma árvore, com `@orpc/server` sobre Hono. Não
 * há classe de servidor a espelhar: do outro lado há handlers que montam objeto a partir do
 * Drizzle. Quem vier procurar a classe da origem para conferir um campo não vai achar uma — a
 * junção que a substitui é a do COMPILADOR, porque `os.router(...)` em `apps/api/src/main.ts` é
 * `implement(wletContract)` e um campo que mude aqui quebra o handler antes de qualquer
 * requisição.
 */

/**
 * As duas formas de vencimento — e o teto do dia útil é 18, não 23.
 *
 * Não é o máximo aritmético de dias de semana num mês (um mês de 31 dias começando na segunda
 * chega a 23): é o que o VALIDADOR EM VIGOR aceita. `packages/ingest/src/pipeline.ts` recusa
 * `nth > 18` e empurra o lançamento para `plannedProblems`, e `apps/web/src/components/due-on-field.tsx`
 * clampa no mesmo número. Um contrato mais permissivo que o validador que o consome não conserta a
 * divergência — inverte o lado dela, e troca "recusa no formulário" por "aceita, grava e some na
 * ingestão", que é pior porque o sintoma aparece longe da causa.
 *
 * Subir para 23 é decisão de DOMÍNIO e muda quatro lugares no mesmo commit: as duas guardas de
 * `pipeline.ts`, o comentário de `apps/web/src/lib/business-days.ts` e este schema.
 */
const dueOn = z.union([z.object({ kind: z.literal('day'), day: z.number().int().min(1).max(31) }), z.object({ kind: z.literal('business-day'), nth: z.number().int().min(1).max(18) })])

/**
 * `amountBetween` é um OBJETO de limites opcionais, não uma tupla.
 *
 * Ele era `z.tuple([number, number])`, e a divergência com o domínio (`MatchRule`, em
 * `packages/domain/src/types.ts`) era total: o pipeline lê `{ min?, max? }` e a configuração real
 * usa `{ min: 200 }` — sem máximo, porque um rateio varia mês a mês e exigir o número exato
 * deixaria a regra eternamente em aberto. Uma tupla não consegue representar isso.
 *
 * O defeito ficou invisível por um `as never` no adapter do cliente. Sem ele, a divergência aparece
 * no typecheck — foi assim que ela foi encontrada, e é por isso que o cast saiu.
 */
const matchRule = z.object({
  merchants: z.array(z.string()),
  accountId: z.string().optional(),
  amountBetween: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
})

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

/**
 * Uma cobrança — e ela NÃO tem `entity`, ao contrário de um lançamento previsto.
 *
 * A ausência é deliberada, e é do domínio: o lado de uma cobrança (PF ou PJ) é DERIVADO da conta
 * que a quita — `receivablesInScope` lê `match.accountId` —, e sem conta declarada ela vale nos
 * dois. Um campo gravado aqui seria uma segunda verdade sobre a mesma pergunta, livre para discordar
 * da conta.
 *
 * `entity` já esteve aqui, OBRIGATÓRIO, e isso tornava `PUT /config` impossível para quem tivesse
 * cobrança declarada: o cliente nunca mandava o campo (o domínio não o tem), e a validação de
 * entrada recusava o corpo inteiro com 400. O defeito ficou invisível porque o adapter do cliente
 * tinha um `as never`, e só não era visto porque uma conta nova não tem cobrança para disparar.
 *
 * `accountId` saiu pelo mesmo motivo, e junto foram as duas colunas de `receivables` que os
 * guardavam (migration `0002`). Elas vinham da cópia do schema de lançamento previsto.
 */
export const receivable = z.object({
  id: z.string(),
  label: z.string(),
  debtor: z.string(),
  amount: z.number(),
  dueOn,
  recurrence: z.enum(['monthly', 'once', 'installments']),
  startMonth: month,
  endMonth: month.optional(),
  count: z.number().int().optional(),
  match: matchRule,
  offsetsCategoryId: z.string(),
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
