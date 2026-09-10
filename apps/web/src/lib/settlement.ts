import { dayOfMonth, nthBusinessDay } from './business-days'
import type { PlannedDueDate, Recurrence, SettlementStatus } from '@wlet/domain'

/**
 * Conciliação de uma regra declarada contra o extrato — quem cumpriu, quando, e o que falta.
 *
 * Mora fora de `receivables` e de `planned` porque as duas fazem exatamente isto. A alocação
 * de pagamento adiantado é a parte sutil, e escrevê-la duas vezes garantiria que uma das duas
 * ficasse para trás no primeiro ajuste.
 *
 * Módulo puro: sem `@/generated`, sem `finance`. Quem chama passa os meses e a data de corte.
 */

/** O mínimo que uma regra precisa ter para ser conciliada. */
export interface SettlementRule {
  id: string
  /** Valor esperado por ocorrência. É REFERÊNCIA: produz a diferença, não decide se quitou. */
  amount: number
  dueOn?: PlannedDueDate
  recurrence: Recurrence
  startMonth: string
  endMonth?: string
  count?: number
  /** Mês → valor que substitui o padrão. */
  exceptions?: Record<string, number>
}

/** O mínimo que um lançamento precisa ter para conciliar. */
export interface SettleableTransaction {
  id: string
  /** Valor absoluto: quem chama já sabe de que lado está. */
  amount: number
  date: string
  month: string
  merchant: string
  /** A regra que este lançamento cumpre, escrita pelo ingest. */
  ruleId: string | null
}

export interface Settlement {
  ruleId: string
  month: string
  dueDate: string | null
  expected: number
  actual: number
  /** Ids dos lançamentos que cobriram esta ocorrência — o caminho de volta ao extrato. */
  transactionIds: string[]
  /** Quem de fato cumpriu. Pode não ser quem se esperava: mãe pagando pelo filho. */
  counterparts: string[]
  status: SettlementStatus
}

function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export function amountAt(rule: SettlementRule, month: string): number {
  return rule.exceptions?.[month] ?? rule.amount
}

/** A data de vencimento daquele mês. `null` quando a regra não declara dia. */
export function dueDateOf(rule: SettlementRule, month: string): string | null {
  if (!rule.dueOn) return null
  return rule.dueOn.kind === 'business-day' ? nthBusinessDay(month, rule.dueOn.nth) : dayOfMonth(month, rule.dueOn.day)
}

/** A regra incide neste mês? */
export function occursIn(rule: SettlementRule, month: string): boolean {
  if (month < rule.startMonth) return false
  if (rule.endMonth && month > rule.endMonth) return false
  if (rule.recurrence === 'once') return month === rule.startMonth
  if (rule.recurrence === 'monthly') return true
  return month <= shift(rule.startMonth, Math.max(1, rule.count ?? 1) - 1)
}

/**
 * Os meses em que a regra incide.
 *
 * Uma parcelada sabe o próprio fim, e ele pode estar no FUTURO: as parcelas que ainda vão
 * vencer precisam aparecer, senão a tela mostraria uma dívida quitada. Uma mensal sem prazo
 * vai até o último mês com dado, porque não há como saber onde ela termina.
 */
function windowOf(rule: SettlementRule, lastMonth: string): string[] {
  const end = rule.recurrence === 'once' ? rule.startMonth : rule.recurrence === 'installments' ? shift(rule.startMonth, Math.max(1, rule.count ?? 1) - 1) : (rule.endMonth ?? lastMonth)
  const limit = rule.endMonth && rule.endMonth < end ? rule.endMonth : end
  const out: string[] = []
  for (let month = rule.startMonth; month <= limit; month = shift(month, 1)) out.push(month)
  return out
}

/**
 * A situação de uma regra em cada mês da janela.
 *
 * `today` não é a data do relógio: é a última data COM DADO. O que ainda não foi exportado do
 * banco não pode ser declarado atrasado — a mesma régua que a previsão usa para decidir o que
 * ainda vence no mês em curso.
 *
 * **A alocação segue a RECORRÊNCIA, e essa é a decisão de projeto.** Uma parcelada é UMA
 * dívida em N vezes: o dinheiro abate a próxima parcela em aberto, venha no mês dela ou não —
 * sem isso, quem paga duas parcelas adiantadas num Pix só fica com o mês seguinte em atraso.
 * Uma mensal é o contrário: cada mês é obrigação própria, e sobra de janeiro não cobre
 * fevereiro. Por isso não há flag: a natureza já está declarada em `recurrence`.
 *
 * Regra sem `dueOn` nunca fica em atraso — sem dia não há como dizer que o prazo passou.
 */
function settleRule(rule: SettlementRule, transactions: SettleableTransaction[], lastMonth: string, today: string): Settlement[] {
  const own = transactions.filter((tx) => tx.ruleId === rule.id && tx.amount > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const isPlan = rule.recurrence !== 'monthly'
  const out: Settlement[] = []

  let cursor = 0
  let creditLeft = own.length ? own[0].amount : 0

  for (const month of windowOf(rule, lastMonth)) {
    const expected = amountAt(rule, month)
    const dueDate = dueDateOf(rule, month)
    let actual = 0
    const ids: string[] = []
    const counterparts = new Set<string>()

    if (isPlan) {
      let need = expected
      while (need > 0.005 && cursor < own.length) {
        const take = Math.min(need, creditLeft)
        if (take > 0) {
          actual += take
          need -= take
          creditLeft -= take
          ids.push(own[cursor].id)
          counterparts.add(own[cursor].merchant)
        }
        if (creditLeft <= 0.005) {
          cursor += 1
          creditLeft = cursor < own.length ? own[cursor].amount : 0
        }
      }
    } else {
      for (const tx of own) {
        if (tx.month !== month) continue
        actual += tx.amount
        ids.push(tx.id)
        counterparts.add(tx.merchant)
      }
    }

    actual = Math.round(actual * 100) / 100
    const status: SettlementStatus = actual >= expected - 0.005 ? 'settled' : actual > 0 ? 'partial' : dueDate && dueDate <= today ? 'overdue' : 'open'
    out.push({ ruleId: rule.id, month, dueDate, expected, actual, transactionIds: ids, counterparts: [...counterparts], status })
  }
  return out
}

/** As ocorrências de várias regras, do mês mais recente para o mais antigo. */
export function settleAll(rules: SettlementRule[], transactions: SettleableTransaction[], lastMonth: string, today: string): Settlement[] {
  return rules.flatMap((rule) => settleRule(rule, transactions, lastMonth, today)).sort((a, b) => b.month.localeCompare(a.month) || a.ruleId.localeCompare(b.ruleId))
}
