import { addMonths, monthsApart } from './months'
import { planTotal } from './plans'
import type { Plan, Transaction } from './types'

/**
 * As compras parceladas do cartão, reconstruídas a partir das parcelas.
 *
 * **Não existe id de compra.** O id de cada lançamento é o `sha1` dos campos dele, mês da fatura
 * incluído, então a 1/6 e a 2/6 da mesma compra são dois lançamentos sem nada que os ligue. O que as
 * liga é a CHAVE abaixo — e ela é uma só no app: a previsão (`committedInstallments`) e o vínculo de
 * planos leem este módulo, porque duas chaves para a mesma compra divergiriam no primeiro caso raro.
 */

const toCents = (value: number) => Math.round(value * 100) / 100

/** A competência de uma data AAAA-MM-DD — o mesmo corte que `monthOf` faz no app. */
export function monthOfDate(date: string): string {
  return date.slice(0, 7)
}

/**
 * A chave da compra: conta, data da compra, mês de origem, descrição crua e número de parcelas.
 *
 * - `postedDate` é a data da COMPRA e se repete em todas as parcelas; é ela que separa duas compras
 *   com a mesma descrição — a hospedagem de maio/26, estornada, tem a mesma `AIRBNB PAGAM*AIRB` da de
 *   julho.
 * - O mês de origem (competência recuada `current - 1` meses) também se repete, e segura o caso de
 *   quem não tem `postedDate` preenchido.
 * - `merchant` NÃO entra: regra de categoria o reescreve, e mudar uma regra quebraria a chave em
 *   silêncio. O valor também não: varia centavos entre parcelas (937,05 e 937,03).
 */
export function purchaseKeyOf(tx: Transaction): string | null {
  if (!tx.installment) return null
  const origin = addMonths(monthOfDate(tx.date), -(tx.installment.current - 1))
  return [tx.accountId, tx.postedDate, origin, tx.rawDescription, tx.installment.total].join('|')
}

/**
 * A fatura mais recente de cada conta.
 *
 * Uma compra só continua rodando se a última parcela dela apareceu NESSA fatura: se parou de aparecer
 * enquanto as faturas seguiram chegando, a série acabou — estorno, quitação, cancelamento.
 */
export function latestInvoiceByAccount(txs: readonly Transaction[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const tx of txs) {
    const month = tx.invoice?.month
    if (month && month > (out.get(tx.accountId) ?? '')) out.set(tx.accountId, month)
  }
  return out
}

export interface InstallmentPurchase<T extends Transaction = Transaction> {
  key: string
  accountId: string
  /** Data da compra (AAAA-MM-DD). */
  postedDate: string
  rawDescription: string
  /** Do lançamento mais recente — é o nome que a pessoa reconhece hoje. */
  merchant: string
  categoryId: string
  /** Em quantas vezes a compra foi feita. */
  installments: number
  /** Competência da parcela 1, mesmo que ela não esteja nos arquivos. */
  originMonth: string
  /** As parcelas presentes, da menor para a maior. */
  seen: T[]
  /** A parcela de maior número vista. */
  latest: T
  /** Quantas parcelas DISTINTAS estão nos arquivos. */
  paidCount: number
  paidAmount: number
  /** Valor absoluto da última parcela vista — a melhor estimativa das que faltam. */
  lastAmount: number
  estimatedTotal: number
  /** Competências das parcelas que ainda faltam, a partir da última vista. */
  remainingMonths: string[]
  /** A última parcela não está na fatura mais recente do cartão: a série parou. */
  ended: boolean
  /** A última parcela vista é a última da compra. */
  completed: boolean
}

/**
 * Agrupa as parcelas de SAÍDA em compras.
 *
 * Genérico no tipo de lançamento para a previsão receber de volta os próprios `ViewTransaction`, com
 * fluxo e categoria exibida, sem conversão.
 */
export function groupInstallmentPurchases<T extends Transaction>(txs: readonly T[], latestInvoice: Map<string, string>): InstallmentPurchase<T>[] {
  const byKey = new Map<string, T[]>()
  for (const tx of txs) {
    if (tx.amount >= 0) continue
    const key = purchaseKeyOf(tx)
    if (!key) continue
    const list = byKey.get(key) ?? []
    list.push(tx)
    byKey.set(key, list)
  }

  const out: InstallmentPurchase<T>[] = []
  for (const [key, list] of byKey) {
    const seen = [...list].sort((a, b) => (a.installment?.current ?? 0) - (b.installment?.current ?? 0))

    // Uma parcela repetida (arquivo baixado duas vezes) não pode pagar duas vezes. Deduplica por
    // `installment.current` — só uma transação por número de parcela — antes de calcular `paidCount`,
    // `paidAmount` e `latest`, para que os três concordem: antes, `paidCount` usava `new Set()` para
    // deduplicar, mas `paidAmount` somava `seen` inteira, contando a duplicada.
    const byInstallmentNumber = new Map<number, T>()
    for (const tx of seen) {
      const installNum = tx.installment?.current ?? 1
      if (!byInstallmentNumber.has(installNum)) byInstallmentNumber.set(installNum, tx)
    }
    const deduped = Array.from(byInstallmentNumber.values()).sort((a, b) => (a.installment?.current ?? 0) - (b.installment?.current ?? 0))

    const latest = deduped[deduped.length - 1]
    const current = latest.installment?.current ?? 1
    const total = latest.installment?.total ?? 1
    const paidAmount = toCents(deduped.reduce((sum, tx) => sum + Math.abs(tx.amount), 0))
    const lastAmount = Math.abs(latest.amount)
    const remaining = Math.max(0, total - current)
    const latestMonth = monthOfDate(latest.date)
    out.push({
      key,
      accountId: latest.accountId,
      postedDate: latest.postedDate,
      rawDescription: latest.rawDescription,
      merchant: latest.merchant,
      categoryId: latest.categoryId,
      installments: total,
      originMonth: addMonths(latestMonth, -(current - 1)),
      seen,
      latest,
      paidCount: deduped.length,
      paidAmount,
      lastAmount,
      estimatedTotal: toCents(paidAmount + remaining * lastAmount),
      remainingMonths: Array.from({ length: remaining }, (_, index) => addMonths(latestMonth, index + 1)),
      // `undefined !== undefined` é falso: cartão sem mês de fatura nunca "encerra" por esta regra —
      // é exatamente como a previsão sempre se comportou.
      ended: latest.invoice?.month !== latestInvoice.get(latest.accountId),
      completed: remaining === 0,
    })
  }
  return out
}

/** A compra que contém um lançamento, ou `null`. */
export function purchaseContaining<T extends Transaction>(purchases: readonly InstallmentPurchase<T>[], transactionId: string): InstallmentPurchase<T> | null {
  return purchases.find((purchase) => purchase.seen.some((tx) => tx.id === transactionId)) ?? null
}

/**
 * O que o vínculo de um plano resolve hoje.
 *
 * `broken` existe para o plano não sumir quando a parcela âncora deixa de existir — o id de um
 * lançamento muda se o perfil da conta mudar, o mesmo risco que os ajustes de categoria aceitam.
 */
export type PlanPurchase<T extends Transaction = Transaction> = { status: 'none' } | { status: 'broken' } | { status: 'linked'; purchase: InstallmentPurchase<T> }

export function planPurchase<T extends Transaction>(plan: Plan, purchases: readonly InstallmentPurchase<T>[]): PlanPurchase<T> {
  if (!plan.purchaseId) return { status: 'none' }
  const purchase = purchaseContaining(purchases, plan.purchaseId)
  return purchase ? { status: 'linked', purchase } : { status: 'broken' }
}

/**
 * A ÚNICA fonte do que um plano vale — a tela e a tabela chamavam duas cópias deste cálculo
 * (`valueOf` em `-content.tsx` e em `planos-data-table.tsx`), e o `CLAUDE.md` já nomeia o
 * defeito: duas somas paralelas para a mesma grandeza divergem no primeiro ajuste.
 *
 * Três leituras, na ordem em que `planPurchase` as distingue:
 * - **`linked` e ENCERRADA antes da última parcela** (`ended && !completed`) — só o PAGO
 *   (`paidAmount`). O resto é fantasma: um 6× estornado depois de 2 parcelas não vale o 6×
 *   inteiro, e contá-lo contradiria "Cai em" e o realce do gráfico, que já dão zero para uma
 *   série que parou de rodar — a mesma tela afirmando dois números para a mesma compra.
 * - **`linked` nos demais casos** (ativa, ou quitada) — o estimado (`estimatedTotal`), que
 *   numa compra quitada já é igual ao pago.
 * - **`none` e `broken`** — `planTotal(plan)`, o planejado de sempre. `broken` não é tratado
 *   como `linked` sem compra: o vínculo aponta para uma parcela que sumiu, e sem ela não há
 *   fato para substituir a projeção.
 */
export function planValue<T extends Transaction>(plan: Plan, purchases: readonly InstallmentPurchase<T>[]): number {
  return planValueOf(plan, planPurchase(plan, purchases))
}

/**
 * O mesmo valor, a partir de um vínculo JÁ resolvido. A linha da tabela resolve o vínculo uma vez para
 * desenhar medidor, caixinha e ações; sem esta variante ela o resolveria de novo a cada leitura do valor.
 */
export function planValueOf<T extends Transaction>(plan: Plan, link: PlanPurchase<T>): number {
  if (link.status !== 'linked') return planTotal(plan)
  return link.purchase.ended && !link.purchase.completed ? link.purchase.paidAmount : link.purchase.estimatedTotal
}

/** Compra que já terminou (encerrada ou quitada) só é oferecida se terminou nestes últimos meses. */
export const SUGGESTION_WINDOW_MONTHS = 12

export interface PurchaseSuggestion<T extends Transaction = Transaction> {
  purchase: InstallmentPurchase<T>
  /** De 0 a 4: um ponto por critério. */
  score: number
  /** Três ou mais pontos: sobe ao topo com o selo "Sugerida". */
  suggested: boolean
  /** Rótulo do OUTRO plano que já usa esta compra, ou `null`. */
  linkedTo: string | null
}

/**
 * As compras que podem ser o plano, na ordem em que a tela as oferece.
 *
 * A pontuação é simples de propósito — quem escolhe é a pessoa, e ela precisa entender por que uma
 * compra subiu. Um ponto por critério: mesmo número de parcelas; total estimado a até 2% do preço do
 * plano (o parcelado, ou o à vista sem parcelado); mesma categoria; mês da compra a até 1 mês do mês do
 * plano. Três ou mais é "Sugerida". A ordem é só ordem: nada é cortado por pontuação baixa.
 *
 * Uma compra liga a UM plano: a que já está ligada a outro vem marcada, para a tela desabilitá-la —
 * senão o mesmo dinheiro voltaria a contar duas vezes.
 */
export function suggestPurchases<T extends Transaction>(plan: Plan, purchases: readonly InstallmentPurchase<T>[], plans: readonly Plan[], lastMonth: string): PurchaseSuggestion<T>[] {
  const linkedTo = new Map<string, string>()
  for (const other of plans) {
    if (other.id === plan.id || !other.purchaseId) continue
    const found = purchaseContaining(purchases, other.purchaseId)
    if (found) linkedTo.set(found.key, other.label)
  }

  const floor = addMonths(lastMonth, -SUGGESTION_WINDOW_MONTHS)
  const price = plan.financed?.total ?? plan.cash
  const installments = plan.financed?.installments ?? 1

  return purchases
    .filter((purchase) => (!purchase.ended && !purchase.completed) || monthOfDate(purchase.latest.date) >= floor)
    .map((purchase) => {
      let score = 0
      if (purchase.installments === installments) score++
      if (price > 0 && Math.abs(purchase.estimatedTotal - price) <= price * 0.02) score++
      if (purchase.categoryId === plan.categoryId) score++
      if (plan.month && Math.abs(monthsApart(monthOfDate(purchase.postedDate), plan.month)) <= 1) score++
      return { purchase, score, suggested: score >= 3, linkedTo: linkedTo.get(purchase.key) ?? null }
    })
    .sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1
      if (a.suggested && a.score !== b.score) return b.score - a.score
      return b.purchase.postedDate.localeCompare(a.purchase.postedDate)
    })
}
