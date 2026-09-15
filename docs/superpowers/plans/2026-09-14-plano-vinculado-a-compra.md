# Plano vinculado a compra parcelada — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** ligar um plano a uma compra parcelada que já está no cartão, mostrar na linha quanto já foi pago (medidor verde) e tirar o plano ligado da previsão, onde hoje ele conta duas vezes com as parcelas contratadas.

**Arquitetura:** o plano guarda `purchaseId` (o id de uma parcela). Um módulo puro em `@wlet/domain/purchases` agrupa lançamentos em compras (chave `conta | data da compra | mês de origem | descrição crua | parcelas`) e calcula progresso, fim de série e sugestões. A previsão passa a usar esse agrupamento e ignora plano ligado. O vínculo atravessa contrato, router e coluna `purchase_id`; a tela ganha medidor, ações de vincular/desvincular e um diálogo de escolha.

**Stack:** TypeScript, React 19, react-hook-form + Zod, oRPC, Drizzle/Postgres, runner `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-14-plano-vinculado-a-compra-design.md` — leia antes de começar.

## Restrições globais

- **NÃO FAÇA COMMIT.** Nenhum `git commit`, `git add`, `git stash`, branch ou worktree. Trabalha-se direto no `master`, deixando as mudanças no working tree.
- **Não toque** em `apps/web/src/routes/planos/-components/group-dialog.tsx`, `packages/ui/src/components/month-picker.tsx`, `packages/ui/src/components/popover.tsx` — têm alterações do usuário.
- Comando de testes do app: `pnpm --dir apps/web run check` (roda `tsx --test scripts/checks/*.test.ts src/**/*.test.ts`). Um arquivo só: `cd apps/web && npx tsx --test scripts/checks/<arquivo>.test.ts`.
- Suíte do servidor: `pnpm --dir apps/api run check` (Postgres em `localhost:5433`, já no ar).
- Typecheck: `pnpm type:check` na raiz. Lint: `pnpm lint` (7 avisos pré-existentes em `packages/ui` são esperados; nenhum novo). Formatação: `pnpm exec biome format --write <arquivos>` só nos arquivos tocados.
- Identificadores em inglês (en-US); comentários, `describe`/`it`, textos de tela e mensagens de erro em português com acentuação correta. O sensor `identifier-language.test.ts` recusa identificador novo em português.
- Comentários explicam o PORQUÊ, no estilo do arquivo em volta.
- Todo teste novo é conferido por mutação: quebre a regra, veja o teste falhar, restaure.
- Valores de dinheiro arredondados a centavos com `Math.round(v * 100) / 100`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `packages/domain/src/months.ts` (novo) | aritmética de mês AAAA-MM (`addMonths`, `monthsApart`) |
| `packages/domain/src/purchases.ts` (novo) | agrupar parcelas em compras, progresso, vínculo do plano, sugestões |
| `packages/domain/src/plans.ts` | usa `months.ts`; `parsePlans` preserva `purchaseId`; agenda ignora plano ligado |
| `packages/domain/src/types.ts` | `Plan.purchaseId?` |
| `apps/web/src/lib/forecast.ts` | agrupamento via domínio; ignora plano ligado |
| `packages/db/src/schema/declarations.ts` + `packages/db/drizzle/0003_*.sql` | coluna `purchase_id` |
| `packages/api/src/domains/plans/shape.ts` | `purchaseId` no contrato |
| `apps/api/src/routers/plans.ts` | leitura e escrita da coluna |
| `packages/services/src/plans/**` | `linkPurchase`, `unlinkPurchase`, `PurchaseAlreadyLinkedError` |
| `apps/web/src/routes/planos/-components/purchase-link-dialog*.ts(x)` (novos) | diálogo de escolha (form + schema + teste) |
| `apps/web/src/routes/planos/-components/purchase-meter.tsx` (novo) | medidor de parcelas pagas |
| `apps/web/src/routes/planos/-components/plan-row-controls.tsx` | células somente leitura quando ligado |
| `apps/web/src/routes/planos/-components/planos-data-table.tsx` | linha ligada, ações, grupo |
| `apps/web/src/routes/planos/-components/plan-schedule-chart.tsx` | realce `'committed'` |
| `apps/web/src/routes/planos/-content.tsx`, `-metric-definitions.ts` | mutações, diálogo, confirmação, KPIs, realce |
| testes: `apps/web/scripts/checks/purchases.test.ts` (novo), `plans.test.ts`, `forecast.test.ts`, `plans-service.test.ts`, `invalidation.test.ts`, `confirmation.test.ts`, `apps/api/tests/routers.test.ts` | |
| docs: `CLAUDE.md`, `.claude/rules/naming.md` | |

**Desvio registrado em relação à spec (seção 3):** o registry não tem `dropdown-menu` nem `radio-group`. Então (a) plano ligado mostra o ícone "Desvincular compra" no lugar do menu "Trocar/Desvincular" — trocar é desvincular e vincular de novo; (b) a lista do diálogo usa botões `role="radio"` dentro de `role="radiogroup"`.

---

### Tarefa 1: Módulo de compras parceladas no domínio

**Arquivos:**
- Criar: `packages/domain/src/months.ts`
- Criar: `packages/domain/src/purchases.ts`
- Modificar: `packages/domain/src/plans.ts` (trocar o `addMonths` privado pelo de `months.ts`)
- Teste: `apps/web/scripts/checks/purchases.test.ts`

**Interfaces:**
- Produz: `addMonths(month: string, by: number): string`, `monthsApart(a: string, b: string): number` (em `@wlet/domain/months`)
- Produz (em `@wlet/domain/purchases`): `monthOfDate(date: string): string`, `purchaseKeyOf(tx: Transaction): string | null`, `latestInvoiceByAccount(txs: readonly Transaction[]): Map<string, string>`, `interface InstallmentPurchase<T extends Transaction = Transaction>`, `groupInstallmentPurchases<T extends Transaction>(txs: readonly T[], latestInvoice: Map<string, string>): InstallmentPurchase<T>[]`, `purchaseContaining<T>(purchases: readonly InstallmentPurchase<T>[], transactionId: string): InstallmentPurchase<T> | null`, `type PlanPurchase<T>`, `planPurchase<T>(plan: Plan, purchases: readonly InstallmentPurchase<T>[]): PlanPurchase<T>`

- [ ] **Passo 1: escrever o teste que falha** — `apps/web/scripts/checks/purchases.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Plan, Transaction } from '@wlet/domain'
import { addMonths, monthsApart } from '@wlet/domain/months'
import { groupInstallmentPurchases, latestInvoiceByAccount, planPurchase, purchaseContaining, purchaseKeyOf } from '@wlet/domain/purchases'

/**
 * As compras parceladas, reconstruídas a partir das parcelas — a base do vínculo entre plano e compra.
 *
 * As fixtures copiam a forma REAL da semente: a hospedagem de julho/26 (6× de ~R$ 937, duas faturas
 * importadas) e a de maio/26, estornada, com a MESMA descrição crua e outra data de compra. É essa
 * vizinhança que decide a chave: descrição sozinha juntaria as duas.
 */
const parcel = (over: Partial<Transaction> & { id: string; date: string; postedDate: string; amount: number; current: number; invoiceMonth: string }): Transaction => {
  const { current, invoiceMonth, ...rest } = over
  return {
    accountId: 'xp-cartao',
    rawDescription: 'AIRBNB PAGAM*AIRB',
    merchant: 'Airbnb',
    categoryId: 'moradia',
    installment: { current, total: 6 },
    invoice: { dueDate: `${invoiceMonth}-10`, month: invoiceMonth },
    ...rest,
  } as Transaction
}

const julyFirst = parcel({ id: 'db78e48a1935', date: '2026-07-04', postedDate: '2026-07-04', amount: -937.05, current: 1, invoiceMonth: '2026-08' })
const julySecond = parcel({ id: '3e8b4c5881bc', date: '2026-08-04', postedDate: '2026-07-04', amount: -937.03, current: 2, invoiceMonth: '2026-09' })
const mayFirst = parcel({ id: 'ff592a71692c', date: '2026-05-11', postedDate: '2026-05-11', amount: -1151.45, current: 1, invoiceMonth: '2026-06' })
const maySecond = parcel({ id: '6689133ee341', date: '2026-06-11', postedDate: '2026-05-11', amount: -1151.41, current: 2, invoiceMonth: '2026-07' })
const ALL = [julyFirst, julySecond, mayFirst, maySecond]

const group = (txs: Transaction[] = ALL) => groupInstallmentPurchases(txs, latestInvoiceByAccount(txs))

describe('aritmética de mês', () => {
  it('soma e subtrai atravessando o ano', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02')
    assert.equal(addMonths('2026-01', -1), '2025-12')
  })

  it('distância em meses, com sinal', () => {
    assert.equal(monthsApart('2026-07', '2026-08'), 1)
    assert.equal(monthsApart('2026-08', '2026-07'), -1)
    assert.equal(monthsApart('2025-12', '2026-02'), 2)
  })
})

describe('a chave da compra', () => {
  it('as parcelas da mesma compra têm a mesma chave', () => {
    assert.equal(purchaseKeyOf(julyFirst), purchaseKeyOf(julySecond))
  })

  it('a compra estornada, com a MESMA descrição crua, tem outra chave', () => {
    assert.notEqual(purchaseKeyOf(julyFirst), purchaseKeyOf(mayFirst))
  })

  it('lançamento sem parcela não tem chave', () => {
    assert.equal(purchaseKeyOf({ ...julyFirst, installment: null }), null)
  })
})

describe('o agrupamento em compras', () => {
  it('produz duas compras, uma para cada data de compra', () => {
    assert.equal(group().length, 2)
  })

  it('o progresso da compra de julho: 2 de 6, R$ 1.874,08 pagos, o resto estimado pela última parcela', () => {
    const july = group().find((p) => p.postedDate === '2026-07-04')
    assert.ok(july)
    assert.equal(july.paidCount, 2)
    assert.equal(july.paidAmount, 1874.08)
    assert.equal(july.lastAmount, 937.03)
    assert.equal(july.estimatedTotal, 5622.2)
    assert.deepEqual(july.remainingMonths, ['2026-09', '2026-10', '2026-11', '2026-12'])
    assert.equal(july.originMonth, '2026-07')
    assert.equal(july.ended, false)
    assert.equal(july.completed, false)
  })

  it('a série cuja última parcela não está na fatura mais recente do cartão está ENCERRADA', () => {
    // A mesma regra que a previsão aplica para parar de projetar: a de maio parou de aparecer
    // enquanto as faturas seguiram chegando — estorno.
    const may = group().find((p) => p.postedDate === '2026-05-11')
    assert.ok(may)
    assert.equal(may.ended, true)
  })

  it('entrada positiva com parcela não vira compra', () => {
    assert.equal(group([{ ...julyFirst, amount: 937.05 }]).length, 0)
  })

  it('parcela repetida conta uma vez no número de pagas', () => {
    assert.equal(group([julyFirst, { ...julyFirst, id: 'duplicada' }, julySecond])[0].paidCount, 2)
  })
})

describe('achar a compra de uma parcela', () => {
  it('qualquer parcela da compra serve de âncora — não precisa ser a 1/N', () => {
    // Compra antiga pode ter as primeiras faturas fora dos arquivos: a âncora é a mais antiga VISÍVEL.
    const third = parcel({ id: 'terceira', date: '2026-09-04', postedDate: '2026-07-04', amount: -937.03, current: 3, invoiceMonth: '2026-10' })
    const purchases = group([julySecond, third])
    assert.equal(purchaseContaining(purchases, 'terceira')?.paidCount, 2)
    assert.equal(purchaseContaining(purchases, julySecond.id)?.key, purchaseContaining(purchases, 'terceira')?.key)
  })

  it('id que não está em compra nenhuma devolve null', () => {
    assert.equal(purchaseContaining(group(), 'nao-existe'), null)
  })
})

describe('o vínculo de um plano', () => {
  const plan = (purchaseId?: string) => ({ id: 'plan-1', label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided', purchaseId }) as Plan

  it('sem purchaseId é "none"', () => {
    assert.equal(planPurchase(plan(), group()).status, 'none')
  })

  it('com a parcela presente é "linked" e traz a compra', () => {
    const result = planPurchase(plan(julyFirst.id), group())
    assert.equal(result.status, 'linked')
    if (result.status === 'linked') assert.equal(result.purchase.postedDate, '2026-07-04')
  })

  it('com a parcela ausente é "broken" — o plano não some, o vínculo aparece quebrado', () => {
    assert.equal(planPurchase(plan('nao-existe'), group()).status, 'broken')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test scripts/checks/purchases.test.ts`
Esperado: FAIL — `Cannot find module '@wlet/domain/months'`.

- [ ] **Passo 3: criar `packages/domain/src/months.ts`**

```ts
/**
 * Aritmética de mês AAAA-MM, sem passar por `Date` — para não pegar fuso.
 *
 * Mora aqui, e não em `plans.ts`, porque duas partes do domínio precisam dela: a agenda dos planos e
 * as compras parceladas. `finance.ts` tem um `shiftMonth` idêntico, e ele não é importado de propósito:
 * aquele arquivo carrega o conjunto no topo, e o domínio é lido pelos testes sem portão de boot.
 */
export function addMonths(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Quantos meses vão de `a` até `b` (positivo quando `b` vem depois). */
export function monthsApart(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return yb * 12 + mb - (ya * 12 + ma)
}
```

- [ ] **Passo 4: usar `months.ts` em `plans.ts`** — em `packages/domain/src/plans.ts`, apague a função privada `addMonths` inteira (e o docblock "Aritmética de mês, num lugar só dentro deste módulo." acima dela) e acrescente no topo, logo após os imports existentes:

```ts
import { addMonths } from './months'
```

- [ ] **Passo 5: criar `packages/domain/src/purchases.ts`**

```ts
import { addMonths } from './months'
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
    const latest = seen[seen.length - 1]
    const current = latest.installment?.current ?? 1
    const total = latest.installment?.total ?? 1
    const paidAmount = toCents(seen.reduce((sum, tx) => sum + Math.abs(tx.amount), 0))
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
      paidCount: new Set(seen.map((tx) => tx.installment?.current)).size,
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
```

Observação: `Plan.purchaseId` só passa a existir na Tarefa 3. Para esta tarefa compilar e os testes rodarem, faça já o passo de tipo daquela tarefa aqui: em `packages/domain/src/types.ts`, na `interface Plan`, logo depois de `groupId?: string`, acrescente:

```ts
  /**
   * O id de UMA parcela da compra parcelada que este plano virou — a mais antiga visível quando o
   * vínculo foi feito. Com ele o plano deixa de ser previsão: pago, a cair e total saem da compra
   * (`@wlet/domain/purchases`). Não existe id de compra; a parcela é a âncora.
   */
  purchaseId?: string
```

- [ ] **Passo 6: rodar e ver passar**

Run: `cd apps/web && npx tsx --test scripts/checks/purchases.test.ts scripts/checks/plans.test.ts`
Esperado: PASS em todos.

- [ ] **Passo 7: conferir por mutação** — troque `tx.postedDate` por `''` em `purchaseKeyOf`, rode `purchases.test.ts` e confirme que "a compra estornada … tem outra chave" e "produz duas compras" falham; restaure. Troque `new Set(...).size` por `seen.length` e confirme que "parcela repetida" falha; restaure.

- [ ] **Passo 8: typecheck e formatação**

Run: `pnpm type:check` → sem `error TS`. `pnpm exec biome format --write packages/domain/src/months.ts packages/domain/src/purchases.ts packages/domain/src/plans.ts packages/domain/src/types.ts apps/web/scripts/checks/purchases.test.ts`.

---

### Tarefa 2: Sugestão de compras para um plano

**Arquivos:**
- Modificar: `packages/domain/src/purchases.ts` (acrescentar ao fim)
- Teste: `apps/web/scripts/checks/purchases.test.ts` (acrescentar ao fim)

**Interfaces:**
- Consome: `InstallmentPurchase`, `purchaseContaining`, `monthOfDate` (Tarefa 1); `addMonths`, `monthsApart` de `./months`.
- Produz: `SUGGESTION_WINDOW_MONTHS = 12`, `interface PurchaseSuggestion<T>`, `suggestPurchases<T extends Transaction>(plan: Plan, purchases: readonly InstallmentPurchase<T>[], plans: readonly Plan[], lastMonth: string): PurchaseSuggestion<T>[]`

- [ ] **Passo 1: escrever os testes que falham** — acrescente ao fim de `purchases.test.ts` (e acrescente `suggestPurchases` ao import de `@wlet/domain/purchases`):

```ts
describe('a sugestão de compras para um plano', () => {
  const airbnbPlan = { id: 'plan-1', label: 'Airbnb Arraial', categoryId: 'moradia', cash: 5622.2, financed: { total: 5622.2, installments: 6 }, payment: 'financed', status: 'decided', month: '2026-08' } as Plan
  const suggest = (plan: Plan = airbnbPlan, plans: Plan[] = [plan]) => suggestPurchases(plan, group(), plans, '2026-09')

  it('a compra que bate nos quatro critérios vem primeiro, sugerida', () => {
    const [first] = suggest()
    assert.equal(first.purchase.postedDate, '2026-07-04')
    assert.equal(first.score, 4)
    assert.equal(first.suggested, true)
  })

  it('a estornada, com total e mês diferentes, não é sugerida', () => {
    const may = suggest().find((s) => s.purchase.postedDate === '2026-05-11')
    assert.ok(may)
    assert.equal(may.score, 2, 'bate só parcelas e categoria')
    assert.equal(may.suggested, false)
  })

  it('cada critério vale um ponto: número de parcelas', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2, installments: 10 } }), 3)
  })

  it('cada critério vale um ponto: total a até 2%', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2 * 1.019, installments: 6 } }), 4, 'dentro de 2%')
    assert.equal(july({ ...airbnbPlan, financed: { total: 5622.2 * 1.03, installments: 6 } }), 3, 'fora de 2%')
  })

  it('cada critério vale um ponto: categoria', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, categoryId: 'viagens' }), 3)
  })

  it('cada critério vale um ponto: mês da compra a até 1 mês do mês do plano', () => {
    const july = (plan: Plan) => suggest(plan).find((s) => s.purchase.postedDate === '2026-07-04')?.score
    assert.equal(july({ ...airbnbPlan, month: '2026-06' }), 4, 'um mês antes conta')
    assert.equal(july({ ...airbnbPlan, month: '2026-10' }), 3, 'três meses depois não conta')
    assert.equal(july({ ...airbnbPlan, month: undefined }), 3, 'plano sem mês não ganha o ponto')
  })

  it('sem sugestão, a ordem é pela data da compra, mais recente primeiro', () => {
    const plain = { id: 'plan-2', label: 'Outra coisa', categoryId: 'compras', cash: 10, status: 'considering' } as Plan
    assert.deepEqual(
      suggest(plain).map((s) => s.purchase.postedDate),
      ['2026-07-04', '2026-05-11'],
    )
  })

  it('compra já ligada a OUTRO plano vem marcada com o nome dele', () => {
    const other = { ...airbnbPlan, id: 'plan-9', label: 'Viagem antiga', purchaseId: julySecond.id } as Plan
    const july = suggest(airbnbPlan, [airbnbPlan, other]).find((s) => s.purchase.postedDate === '2026-07-04')
    assert.equal(july?.linkedTo, 'Viagem antiga')
  })

  it('o próprio vínculo do plano não o marca como ligado a outro', () => {
    const self = { ...airbnbPlan, purchaseId: julyFirst.id } as Plan
    assert.equal(suggest(self, [self]).find((s) => s.purchase.postedDate === '2026-07-04')?.linkedTo, null)
  })

  it('compra encerrada há mais de 12 meses fica de fora; ativa, nunca', () => {
    const old = parcel({ id: 'antiga', date: '2024-01-04', postedDate: '2024-01-04', amount: -100, current: 1, invoiceMonth: '2024-02' })
    const purchases = groupInstallmentPurchases([...ALL, old], latestInvoiceByAccount([...ALL, old]))
    const dates = suggestPurchases(airbnbPlan, purchases, [airbnbPlan], '2026-09').map((s) => s.purchase.postedDate)
    assert.equal(dates.includes('2024-01-04'), false)
    assert.equal(dates.includes('2026-07-04'), true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test scripts/checks/purchases.test.ts`
Esperado: FAIL — `suggestPurchases` não é exportada.

- [ ] **Passo 3: implementar** — acrescente ao fim de `packages/domain/src/purchases.ts` (e troque o import do topo por `import { addMonths, monthsApart } from './months'`):

```ts
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
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd apps/web && npx tsx --test scripts/checks/purchases.test.ts`
Esperado: PASS.

- [ ] **Passo 5: conferir por mutação** — troque `<= price * 0.02` por `<= price * 0.05` e confirme que "total a até 2%" falha; restaure. Troque `score >= 3` por `score >= 2` e confirme que "a estornada … não é sugerida" falha; restaure.

- [ ] **Passo 6: formatação** — `pnpm exec biome format --write packages/domain/src/purchases.ts apps/web/scripts/checks/purchases.test.ts`.

---

### Tarefa 3: `parsePlans` preserva o vínculo e a agenda ignora plano ligado

**Arquivos:**
- Modificar: `packages/domain/src/plans.ts` (`parsePlans`, `planScheduleByMonth`)
- Teste: `apps/web/scripts/checks/plans.test.ts` (acrescentar ao fim)

**Interfaces:**
- Consome: `Plan.purchaseId` (acrescentado na Tarefa 1).
- Produz: `parsePlans` devolve `purchaseId` quando o envelope o traz; `planScheduleByMonth` não conta plano com `purchaseId`.

- [ ] **Passo 1: escrever os testes que falham** — acrescente ao fim de `apps/web/scripts/checks/plans.test.ts`:

```ts
describe('o plano ligado a uma compra', () => {
  const base = { version: PLANS_VERSION, groups: [], items: [{ id: 'plan-1', label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, financed: { total: 5622.2, installments: 6 }, payment: 'financed', status: 'decided', month: '2026-08' }] }

  it('parsePlans preserva o purchaseId — exportar e importar não desfaz o vínculo', () => {
    const parsed = parsePlans({ ...base, items: [{ ...base.items[0], purchaseId: 'db78e48a1935' }] })
    assert.equal(parsed.items[0].purchaseId, 'db78e48a1935')
  })

  it('sem purchaseId, a chave nem aparece — ausência não vira string vazia', () => {
    assert.equal('purchaseId' in parsePlans(base).items[0], false)
  })

  it('purchaseId em branco é descartado', () => {
    assert.equal('purchaseId' in parsePlans({ ...base, items: [{ ...base.items[0], purchaseId: '  ' }] }).items[0], false)
  })

  it('a agenda NÃO conta plano ligado: as parcelas dele já são contratado', () => {
    const linked = { ...(parsePlans(base).items[0] as Plan), purchaseId: 'db78e48a1935' }
    assert.deepEqual(planScheduleByMonth([linked]), [])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test scripts/checks/plans.test.ts`
Esperado: FAIL em "preserva o purchaseId" e "a agenda NÃO conta plano ligado".

- [ ] **Passo 3: implementar**

Em `parsePlans`, logo depois de `const groupId = text(p.groupId)`, acrescente:

```ts
    // O vínculo com a compra só atravessa quando é um id de verdade: string vazia não é vínculo.
    const purchaseId = text(p.purchaseId)
```

e troque a linha `items.push({ id, label, categoryId, cash, financed, payment, status, month: at, groupId: groupId && known.has(groupId) ? groupId : undefined, note: text(p.note) })` por:

```ts
    items.push({
      id,
      label,
      categoryId,
      cash,
      financed,
      payment,
      status,
      month: at,
      groupId: groupId && known.has(groupId) ? groupId : undefined,
      note: text(p.note),
      ...(purchaseId ? { purchaseId } : {}),
    })
```

Em `planScheduleByMonth`, troque `const live = items.filter((p) => p.status !== 'discarded' && p.month !== undefined)` por:

```ts
  // Plano ligado a uma compra fica de fora: as parcelas restantes dele já entram como CONTRATADO, e
  // contá-las aqui também seria o mesmo dinheiro duas vezes.
  const live = items.filter((p) => p.status !== 'discarded' && p.month !== undefined && !p.purchaseId)
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd apps/web && npx tsx --test scripts/checks/plans.test.ts`
Esperado: PASS (os testes antigos também).

- [ ] **Passo 5: conferir por mutação** — remova `&& !p.purchaseId` e confirme que o teste da agenda falha; restaure.

- [ ] **Passo 6: formatação** — `pnpm exec biome format --write packages/domain/src/plans.ts apps/web/scripts/checks/plans.test.ts`.

---

### Tarefa 4: A previsão usa o agrupamento compartilhado e não conta o plano ligado

**Arquivos:**
- Criar (temporário, apagar no fim): `apps/web/scripts/.measure-committed.ts`
- Modificar: `apps/web/src/lib/forecast.ts`
- Teste: `apps/web/scripts/checks/forecast.test.ts` (acrescentar), `apps/web/scripts/checks/purchases.test.ts` (sensor de fonte)

**Interfaces:**
- Consome: `groupInstallmentPurchases`, `latestInvoiceByAccount` (Tarefa 1).
- Produz: `buildForecast`, `forecastItems` ignoram `plan.purchaseId`; `CommittedInstallment.purchase` passa a ser a chave de `purchaseKeyOf`.

- [ ] **Passo 1: medir o "contratado" na semente ANTES** — crie `apps/web/scripts/.measure-committed.ts`:

```ts
import { readFileSync } from 'node:fs'
import { setDataset, setDeclarations } from '@/lib/dataset'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/generated/${name}.json`, import.meta.url), 'utf8'))
setDataset({ transactions: read('transactions'), accounts: read('accounts'), transfers: read('transfers'), investments: read('investments'), meta: read('meta') } as never)
setDeclarations({ planned: [], budget: { monthlyLimit: 0, warnAt: 0.75, byCategory: [] }, receivables: [], goals: [], accounts: [], rules: [], selfNamePatterns: [] } as never)

const { selectTransactions, monthsBetween, lastMonthWithData, shiftMonth } = await import('@/lib/finance')
const { committedFor } = await import('@/lib/forecast')

const last = lastMonthWithData()
const history = selectTransactions('all', { from: '2000-01', to: '2100-12' }, {})
const months = monthsBetween(shiftMonth(last, -1), shiftMonth(last, 18))
const { byMonth, byCategory } = committedFor(history, months)
for (const month of months) console.log('month', month, (byMonth.get(month) ?? 0).toFixed(2))
for (const [categoryId, perMonth] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
  for (const month of months) if (perMonth.get(month)) console.log('cat', categoryId, month, (perMonth.get(month) ?? 0).toFixed(2))
}
```

Run: `cd apps/web && npx tsx scripts/.measure-committed.ts > /Users/bernardomennndes/.claude-bernardo/jobs/2f7127a8/tmp/committed-before.txt && wc -l /Users/bernardomennndes/.claude-bernardo/jobs/2f7127a8/tmp/committed-before.txt`
Esperado: arquivo com linhas `month …` e `cat …`. Se `src/generated/` não existir, rode antes `pnpm --dir apps/web run setup`.

- [ ] **Passo 2: escrever os testes que falham** — em `apps/web/scripts/checks/forecast.test.ts`, acrescente ao fim:

```ts
describe('plano LIGADO a uma compra não é previsão', () => {
  // A compra de 3× comprada em março tem a parcela de abril no contratado. Um plano decidido que
  // descreve a MESMA compra somava de novo — o defeito que o vínculo existe para consertar.
  const purchase = () => bought(100, 'compras', 3)
  const samePurchasePlan = (over: Partial<Plan> = {}) => planned({ label: 'Compra parcelada', categoryId: 'compras', cash: 100, month: MONTH, ...over })

  it('sem vínculo o mês soma o mesmo dinheiro duas vezes — é o defeito documentado', () => {
    const month = april({ history: [purchase()], plans: [samePurchasePlan()] })
    assert.equal(month.sources.committed, 100)
    assert.equal(month.sources.plan, 100)
  })

  it('com purchaseId o plano sai da soma, e o contratado continua', () => {
    const month = april({ history: [purchase()], plans: [samePurchasePlan({ purchaseId: 'qualquer-parcela' })] })
    assert.equal(month.sources.committed, 100)
    assert.equal(month.sources.plan, 0)
  })

  it('e a agenda do mês não lista o plano ligado', () => {
    const items = forecastItems(input({ history: [purchase()], plans: [samePurchasePlan({ purchaseId: 'qualquer-parcela' })] }), MONTH)
    assert.equal(items.filter((item) => item.origin === 'plan').length, 0)
    assert.equal(items.filter((item) => item.origin === 'committed').length, 1)
  })
})
```

Em `apps/web/scripts/checks/purchases.test.ts`, acrescente `import { readFileSync } from 'node:fs'` no topo e ao fim:

```ts
describe('a previsão usa ESTE agrupamento, e não um próprio', () => {
  // Duas chaves para a mesma compra divergem no primeiro caso raro — e o vínculo do plano deixaria
  // de achar a compra que a previsão projeta.
  const source = readFileSync(new URL('../../src/lib/forecast.ts', import.meta.url), 'utf8')

  it('forecast.ts importa groupInstallmentPurchases do domínio', () => {
    assert.match(source, /groupInstallmentPurchases[^\n]*from '@wlet\/domain\/purchases'/)
  })

  it('e não tem mais uma função de chave de compra própria', () => {
    assert.doesNotMatch(source, /function purchaseKey\(/)
  })
})
```

- [ ] **Passo 3: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test scripts/checks/forecast.test.ts scripts/checks/purchases.test.ts`
Esperado: FAIL em "com purchaseId o plano sai da soma", "a agenda do mês não lista o plano ligado" e nos dois do sensor de fonte. "sem vínculo…" já PASSA (documenta o estado atual).

- [ ] **Passo 4: implementar em `apps/web/src/lib/forecast.ts`**

4a. Acrescente ao bloco de imports:

```ts
import { groupInstallmentPurchases, latestInvoiceByAccount } from '@wlet/domain/purchases'
```

4b. Apague a função `purchaseKey` inteira e o docblock "A compra por trás de uma parcela." acima dela.

4c. Substitua o corpo inteiro de `committedInstallments` (mantendo o docblock acima dela) por:

```ts
function committedInstallments(history: ViewTransaction[], targets: string[]): CommittedInstallment[] {
  const out: CommittedInstallment[] = []
  const wanted = new Set(targets)

  // O agrupamento em compras e a regra de fim de série moram em `@wlet/domain/purchases`, onde o
  // vínculo de planos também os lê: só a ÚLTIMA parcela vista projeta, e só se ela apareceu na fatura
  // mais recente daquele cartão. Foi o caso de uma hospedagem em 6x de maio, estornada em julho e
  // recobrada como outro 6x; sem a checagem ela projetava R$ 890,00 em outubro.
  const expenses = history.filter((tx) => tx.flow === 'expense')
  for (const purchase of groupInstallmentPurchases(expenses, latestInvoiceByAccount(history))) {
    if (purchase.ended) continue
    const { latest } = purchase
    const current = latest.installment?.current ?? purchase.installments
    for (let k = 1; k <= purchase.installments - current; k++) {
      const month = shiftMonth(latest.month, k)
      if (!wanted.has(month)) continue
      out.push({
        month,
        merchant: latest.merchant,
        purchase: purchase.key,
        amount: Math.abs(latest.amount),
        categoryId: latest.displayCategoryId,
        installment: { current: current + k, total: purchase.installments },
      })
    }
  }
  return out
}
```

4d. Em `expenseByCategory`, troque `if (!planOccursIn(plan, month)) continue` (dentro do laço `for (const plan of input.plans ?? [])`) por:

```ts
    // Plano ligado a uma compra já é fato: as parcelas restantes dele entraram acima, como contratado.
    if (plan.purchaseId || !planOccursIn(plan, month)) continue
```

4e. Em `forecastItems`, faça a mesma troca no laço `for (const plan of input.plans ?? [])`:

```ts
    if (plan.purchaseId || !planOccursIn(plan, month)) continue
```

- [ ] **Passo 5: rodar e ver passar**

Run: `cd apps/web && npx tsx --test scripts/checks/forecast.test.ts scripts/checks/committed.test.ts scripts/checks/purchases.test.ts`
Esperado: PASS em todos — os testes antigos de `committed.test.ts` e `forecast.test.ts` SEM alteração.

- [ ] **Passo 6: medir DEPOIS e comparar**

Run: `cd apps/web && npx tsx scripts/.measure-committed.ts > /Users/bernardomennndes/.claude-bernardo/jobs/2f7127a8/tmp/committed-after.txt && diff /Users/bernardomennndes/.claude-bernardo/jobs/2f7127a8/tmp/committed-before.txt /Users/bernardomennndes/.claude-bernardo/jobs/2f7127a8/tmp/committed-after.txt && echo IDENTICO`
Esperado: `IDENTICO`. **Se houver diferença, NÃO a "corrija"**: pare, registre as linhas do diff no relatório da tarefa com status DONE_WITH_CONCERNS, e deixe o controlador decidir.

- [ ] **Passo 7: apagar o script temporário** — `rm apps/web/scripts/.measure-committed.ts`.

- [ ] **Passo 8: conferir por mutação** — remova `plan.purchaseId ||` em `expenseByCategory` e confirme que "com purchaseId o plano sai da soma" falha; restaure.

- [ ] **Passo 9: typecheck e formatação** — `pnpm type:check`; `pnpm exec biome format --write apps/web/src/lib/forecast.ts apps/web/scripts/checks/forecast.test.ts apps/web/scripts/checks/purchases.test.ts`.

---

### Tarefa 5: Persistência — coluna, migration, contrato e router

**Arquivos:**
- Modificar: `packages/db/src/schema/declarations.ts` (tabela `plans`)
- Criar (gerado): `packages/db/drizzle/0003_*.sql` e `packages/db/drizzle/meta/*`
- Modificar: `packages/api/src/domains/plans/shape.ts`
- Modificar: `apps/api/src/routers/plans.ts`
- Teste: `apps/api/tests/routers.test.ts`

**Interfaces:**
- Consome: `Plan.purchaseId` (Tarefa 1).
- Produz: `plan.purchaseId?: string` no fio; coluna `purchase_id text` nula.

- [ ] **Passo 1: escrever o teste que falha** — em `apps/api/tests/routers.test.ts`, dentro de `describe('planos', () => {`, depois do teste "apagar um grupo NÃO apaga os planos dele", acrescente:

```ts
  it('o vínculo com a compra atravessa: add, update e replaceAll preservam purchaseId', async () => {
    // O campo passa pelo Zod mesmo sem coluna — a requisição responde 200 e o insert não o menciona.
    // É o elo que só um teste contra o banco de verdade vê.
    const { context } = await comUsuario()
    const r = plansRouter(d)
    const criado = await call(r.add, { label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided', purchaseId: 'db78e48a1935' }, { context })
    const id = criado.items[0].id
    assert.equal(criado.items[0].purchaseId, 'db78e48a1935')

    const editado = await call(r.update, { id, patch: { label: 'Airbnb Arraial' } }, { context })
    assert.equal(editado.items[0].purchaseId, 'db78e48a1935', 'o patch sem o campo não apaga o vínculo')

    const substituido = await call(r.replaceAll, { groups: [], items: [{ ...editado.items[0], purchaseId: '3e8b4c5881bc' }] }, { context })
    assert.equal(substituido.items[0].purchaseId, '3e8b4c5881bc')

    const semVinculo = await call(r.replaceAll, { groups: [], items: [{ id, label: 'Airbnb', categoryId: 'moradia', cash: 5622.2, status: 'decided' }] }, { context })
    assert.equal('purchaseId' in semVinculo.items[0], false, 'sem vínculo, a chave não volta como null')
  })
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm --dir apps/api run check 2>&1 | grep -E "ℹ (tests|pass|fail)|✖" | head`
Esperado: FAIL no teste novo (erro de tipo do Zod na entrada ou `purchaseId` indefinido na saída).

- [ ] **Passo 3: coluna** — em `packages/db/src/schema/declarations.ts`, na tabela `plans`, depois de `groupId: text('group_id'),` acrescente:

```ts
    /**
     * Id de UMA parcela da compra parcelada que o plano virou. Sem chave estrangeira de propósito,
     * como `overrides.transaction_id`: o conjunto de lançamentos é regravado inteiro a cada ingestão.
     */
    purchaseId: text('purchase_id'),
```

- [ ] **Passo 4: migration**

Run: `pnpm --filter @wlet/db db:generate`
Esperado: novo `packages/db/drizzle/0003_<nome>.sql` contendo `ALTER TABLE "plans" ADD COLUMN "purchase_id" text;`. Confira o conteúdo com `cat`.

Run: `pnpm --filter @wlet/db db:migrate`
Esperado: aplica sem erro no Postgres local.

- [ ] **Passo 5: contrato** — em `packages/api/src/domains/plans/shape.ts`, dentro de `export const plan = z.object({`, depois de `groupId: z.string().optional(),` acrescente:

```ts
  /** A parcela âncora da compra que o plano virou — ver `@wlet/domain/purchases`. */
  purchaseId: z.string().optional(),
```

- [ ] **Passo 6: router** — em `apps/api/src/routers/plans.ts`:

Em `toPlan`, depois de `...(r.groupId ? { groupId: r.groupId } : {}),` acrescente:

```ts
    ...(r.purchaseId ? { purchaseId: r.purchaseId } : {}),
```

Em `values`, depois de `groupId: p.groupId ?? null,` acrescente:

```ts
    purchaseId: p.purchaseId ?? null,
```

- [ ] **Passo 7: rodar e ver passar**

Run: `pnpm --dir apps/api run check 2>&1 | grep -E "ℹ (tests|pass|fail)|✖" | head`
Esperado: PASS, 0 fail.

Run: `cd apps/web && npx tsx --test scripts/checks/wire-shape.test.ts scripts/checks/db-columns.test.ts`
Esperado: PASS (os sensores leem os campos dos dois lados; com domínio, contrato e coluna alinhados, nada muda nas listas declaradas).

- [ ] **Passo 8: conferir por mutação** — remova a linha `purchaseId: p.purchaseId ?? null,` do router, rode a suíte do servidor e confirme a falha no teste novo; restaure.

- [ ] **Passo 9: typecheck e formatação** — `pnpm type:check`; `pnpm exec biome format --write packages/db/src/schema/declarations.ts packages/api/src/domains/plans/shape.ts apps/api/src/routers/plans.ts apps/api/tests/routers.test.ts`.

---

### Tarefa 6: Serviço — vincular e desvincular

**Arquivos:**
- Modificar: `packages/services/src/plans/domain/errors/index.ts`
- Modificar: `packages/services/src/plans/application/plans.service.ts`
- Modificar: `packages/services/src/plans/index.ts`
- Teste: `apps/web/scripts/checks/plans-service.test.ts`

**Interfaces:**
- Consome: `Plan.purchaseId`.
- Produz: `PlansService.linkPurchase(planId: string, purchaseId: string): Promise<Plan>`, `PlansService.unlinkPurchase(planId: string): Promise<Plan>`, `class PurchaseAlreadyLinkedError extends DomainError` (exportado pelo barrel).

- [ ] **Passo 1: escrever os testes que falham** — em `apps/web/scripts/checks/plans-service.test.ts`, troque o import de erros por `import { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError, PurchaseAlreadyLinkedError } from '@wlet/services/plans/domain/errors/index'` e acrescente ao fim:

```ts
/** O vínculo com a compra parcelada: uma escrita, e uma compra liga a um plano só. */
describe('linkPurchase e unlinkPurchase', () => {
  it('ligar grava o id da parcela e marca o plano como decidido, numa escrita', async () => {
    const { repository, service } = setup()
    const created = await service.addPlan(monitor)
    const before = repository.saves
    const linked = await service.linkPurchase(created.id, 'db78e48a1935')
    assert.equal(linked.purchaseId, 'db78e48a1935')
    assert.equal(linked.status, 'decided')
    assert.equal(repository.saves - before, 1)
  })

  it('desvincular remove o id e mantém a situação', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')
    const unlinked = await service.unlinkPurchase(created.id)
    assert.equal('purchaseId' in unlinked, false)
    assert.equal(unlinked.status, 'decided')
  })

  it('a compra já ligada a outro plano é recusada, e nada é gravado', async () => {
    const { repository, service } = setup()
    const first = await service.addPlan(monitor)
    const second = await service.addPlan({ ...monitor, label: 'Cadeira' })
    await service.linkPurchase(first.id, 'db78e48a1935')
    const before = repository.saves
    await assert.rejects(() => service.linkPurchase(second.id, 'db78e48a1935'), PurchaseAlreadyLinkedError)
    assert.equal(repository.saves, before)
  })

  it('religar o MESMO plano à mesma parcela não é conflito', async () => {
    const { service } = setup()
    const created = await service.addPlan(monitor)
    await service.linkPurchase(created.id, 'db78e48a1935')
    assert.equal((await service.linkPurchase(created.id, 'db78e48a1935')).purchaseId, 'db78e48a1935')
  })

  it('plano inexistente é PlanNotFoundError nos dois caminhos, sem gravar', async () => {
    const { repository, service } = setup()
    await service.addPlan(monitor)
    const before = repository.saves
    await assert.rejects(() => service.linkPurchase('plan-99', 'db78e48a1935'), PlanNotFoundError)
    await assert.rejects(() => service.unlinkPurchase('plan-99'), PlanNotFoundError)
    assert.equal(repository.saves, before)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test scripts/checks/plans-service.test.ts`
Esperado: FAIL — `PurchaseAlreadyLinkedError` não exportado / `linkPurchase is not a function`.

- [ ] **Passo 3: erro** — acrescente ao fim de `packages/services/src/plans/domain/errors/index.ts`:

```ts
/**
 * A compra escolhida já é outro plano.
 *
 * Uma compra liga a UM plano: dois planos apontando para as mesmas parcelas voltariam a contar o mesmo
 * dinheiro duas vezes, que é o defeito que o vínculo existe para desfazer.
 */
export class PurchaseAlreadyLinkedError extends DomainError {
  constructor(message = 'Esta compra já está ligada a outro plano.') {
    super(message)
  }
}
```

- [ ] **Passo 4: serviço** — em `packages/services/src/plans/application/plans.service.ts`:

Troque o import de erros por `import { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError, PurchaseAlreadyLinkedError } from '../domain/errors'`.

Na `interface PlansService`, depois de `renameGroup(id: string, label: string): Promise<PlanGroup>`, acrescente:

```ts
  /**
   * Liga o plano a uma compra parcelada pela id de uma parcela, e o marca como decidido — a compra já
   * foi feita. Uma escrita só.
   */
  linkPurchase(planId: string, purchaseId: string): Promise<Plan>
  /** Desfaz o vínculo; a situação fica como está. Uma escrita só. */
  unlinkPurchase(planId: string): Promise<Plan>
```

No objeto devolvido por `makePlansService`, depois do método `renameGroup(id, label) { … },`, acrescente:

```ts
    linkPurchase(planId, purchaseId) {
      return mutate((data) => {
        if (data.items.some((item) => item.id !== planId && item.purchaseId === purchaseId)) throw new PurchaseAlreadyLinkedError()
        return patched(data, planId, { purchaseId, status: 'decided' })
      })
    },

    unlinkPurchase(planId) {
      return mutate((data) => {
        const current = locate(data, planId)
        const { purchaseId: _dropped, ...rest } = current
        return { next: { ...data, items: data.items.map((item) => (item.id === planId ? rest : item)) }, result: rest }
      })
    },
```

Observação: a checagem de conflito vem antes de `patched`, então um `planId` inexistente com parcela livre cai em `PlanNotFoundError` (de `locate`, dentro de `patched`), como o teste exige.

- [ ] **Passo 5: barrel** — em `packages/services/src/plans/index.ts`, troque `export { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError } from './domain/errors'` por:

```ts
export { InvalidPlanError, PlanGroupNotFoundError, PlanNotFoundError, PurchaseAlreadyLinkedError } from './domain/errors'
```

- [ ] **Passo 6: rodar e ver passar**

Run: `cd apps/web && npx tsx --test scripts/checks/plans-service.test.ts scripts/checks/plans-concurrency.test.ts`
Esperado: PASS.

- [ ] **Passo 7: conferir por mutação** — remova a checagem `data.items.some(...)` e confirme que "a compra já ligada a outro plano é recusada" falha; restaure.

- [ ] **Passo 8: typecheck e formatação** — `pnpm type:check`; `pnpm exec biome format --write packages/services/src/plans/domain/errors/index.ts packages/services/src/plans/application/plans.service.ts packages/services/src/plans/index.ts apps/web/scripts/checks/plans-service.test.ts`.

---

### Tarefa 7: Diálogo "Vincular compra"

**Arquivos:**
- Criar: `apps/web/src/routes/planos/-components/purchase-link-dialog-schema.ts`
- Criar: `apps/web/src/routes/planos/-components/purchase-link-dialog-schema.test.ts`
- Criar: `apps/web/src/routes/planos/-components/purchase-link-dialog.tsx`
- Modificar: `.claude/rules/naming.md` (linha 59)

**Interfaces:**
- Consome: `PurchaseSuggestion` (Tarefa 2), `monthOfDate` (Tarefa 1).
- Produz: `PurchaseLinkDialog({ plan, suggestions, accountName, onOpenChange, onSubmit }: { plan: Plan | null; suggestions: PurchaseSuggestion[]; accountName: (accountId: string) => string; onOpenChange: (open: boolean) => void; onSubmit: (suggestion: PurchaseSuggestion) => void })`. Aberto quando `plan !== null`. `onSubmit` recebe a sugestão escolhida (a tela precisa de `purchase.seen[0].id`, `merchant`, `installments`).

- [ ] **Passo 1: escrever o teste do schema que falha** — `purchase-link-dialog-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { purchaseLinkSchema } from './purchase-link-dialog-schema'

describe('a escolha da compra no diálogo', () => {
  it('a saída é o purchaseId escolhido, e só ele', () => {
    assert.deepEqual(purchaseLinkSchema.parse({ purchaseId: 'db78e48a1935' }), { purchaseId: 'db78e48a1935' })
  })

  it('sem escolha, a mensagem que a tela mostra', () => {
    const result = purchaseLinkSchema.safeParse({ purchaseId: '' })
    assert.equal(result.success, false)
    if (!result.success) assert.match(result.error.issues[0].message, /Escolha uma compra/)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd apps/web && npx tsx --test src/routes/planos/-components/purchase-link-dialog-schema.test.ts`
Esperado: FAIL — módulo não existe.

- [ ] **Passo 3: schema** — `purchase-link-dialog-schema.ts`:

```ts
import type { Plan } from '@wlet/domain'
import { z } from 'zod'

/**
 * A escolha da compra que o plano virou — um campo só, e ainda assim formulário (`forms.md` §1).
 *
 * O valor é o id de UMA parcela da compra; o diálogo guarda o da parcela mais antiga visível. A saída é
 * declarada no tipo do domínio, que é o que o sensor `form-domain-link` exige.
 */
export const purchaseLinkSchema = z
  .object({ purchaseId: z.string().min(1, 'Escolha uma compra.') })
  .transform((values): Required<Pick<Plan, 'purchaseId'>> => ({ purchaseId: values.purchaseId }))

export type PurchaseLinkFormValues = z.input<typeof purchaseLinkSchema>
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd apps/web && npx tsx --test src/routes/planos/-components/purchase-link-dialog-schema.test.ts scripts/checks/form-domain-link.test.ts`
Esperado: PASS.

- [ ] **Passo 5: componente** — `purchase-link-dialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import type { Plan } from '@wlet/domain'
import { monthOfDate, type PurchaseSuggestion } from '@wlet/domain/purchases'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { Button } from '@wlet/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@wlet/ui/components/dialog'
import { FieldError } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { type RefObject, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type PurchaseLinkFormValues, purchaseLinkSchema } from './purchase-link-dialog-schema'

/** "2026-07-04" → "04/07/2026", sem `Date`: data-only formatada como data-hora mostra o dia anterior. */
const dayOf = (date: string) => date.split('-').reverse().join('/')

/** Busca que dobra acento e caixa: quem digita "airbnb" acha "Airbnb", e "aluguel" acha "Aluguél". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * O diálogo que liga um plano a uma compra parcelada.
 *
 * Lista COMPRAS, não parcelas: uma linha por compra, com o que a pessoa precisa para reconhecê-la —
 * estabelecimento, data da compra, conta, parcela, total estimado e quantas já foram pagas. As parecidas
 * com o plano sobem com o selo "Sugerida"; nada é cortado, só ordenado.
 *
 * É `Dialog` e não `Sheet`: é uma escolha numa lista, não um formulário de vários campos. O botão de
 * confirmar mora no rodapé, fora do `<form>`, e submete pelo `formRef` (`forms.md` §4).
 */
export function PurchaseLinkDialog({
  plan,
  suggestions,
  accountName,
  onOpenChange,
  onSubmit,
}: {
  plan: Plan | null
  suggestions: PurchaseSuggestion[]
  accountName: (accountId: string) => string
  onOpenChange: (open: boolean) => void
  onSubmit: (suggestion: PurchaseSuggestion) => void
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Dialog open={plan !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular compra</DialogTitle>
          <DialogDescription>{plan ? `Escolha a compra parcelada que é "${plan.label}". As parecidas aparecem primeiro.` : null}</DialogDescription>
        </DialogHeader>

        {/* A chave remonta o formulário a cada plano: a escolha e a busca nascem vazias sem efeito de reset. */}
        {plan ? <PurchaseLinkForm key={plan.id} formRef={formRef} suggestions={suggestions} accountName={accountName} onSubmit={onSubmit} /> : null}

        <DialogFooter>
          <Button onClick={() => formRef.current?.requestSubmit()} disabled={suggestions.length === 0}>
            Vincular
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PurchaseLinkForm({
  formRef,
  suggestions,
  accountName,
  onSubmit,
}: {
  formRef: RefObject<HTMLFormElement | null>
  suggestions: PurchaseSuggestion[]
  accountName: (accountId: string) => string
  onSubmit: (suggestion: PurchaseSuggestion) => void
}) {
  const [query, setQuery] = useState('')
  const { control, handleSubmit, formState } = useForm<PurchaseLinkFormValues, unknown, { purchaseId: string }>({
    resolver: zodResolver(purchaseLinkSchema),
    defaultValues: { purchaseId: '' },
  })

  const idOf = (suggestion: PurchaseSuggestion) => suggestion.purchase.seen[0].id
  const needle = fold(query.trim())
  const visible = needle ? suggestions.filter((s) => fold(`${s.purchase.merchant} ${s.purchase.rawDescription}`).includes(needle)) : suggestions

  if (suggestions.length === 0) {
    return <p className="rounded-lg border px-3 py-6 text-center text-muted-foreground">Nenhuma compra parcelada nos arquivos. Importe as faturas em Meus dados.</p>
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={handleSubmit(({ purchaseId }) => {
        const chosen = suggestions.find((s) => idOf(s) === purchaseId)
        if (chosen) onSubmit(chosen)
      })}
    >
      <Input aria-label="Buscar compra pelo nome" placeholder="Buscar pelo nome…" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />

      <Controller
        control={control}
        name="purchaseId"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Compras parceladas" className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
            {visible.length === 0 ? <p className="px-3 py-6 text-center text-muted-foreground">Nenhuma compra com esse nome.</p> : null}
            {visible.map((suggestion) => {
              const { purchase } = suggestion
              const id = idOf(suggestion)
              const checked = field.value === id
              const blocked = suggestion.linkedTo !== null
              const situation = blocked ? `Ligada a ${suggestion.linkedTo}` : purchase.completed ? 'Quitada' : purchase.ended ? `Encerrada em ${formatMonthShort(monthOfDate(purchase.latest.date))}` : 'Ativa'
              return (
                <button
                  key={purchase.key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={blocked}
                  onClick={() => field.onChange(id)}
                  className={cn('flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60', checked && 'bg-muted')}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{purchase.merchant}</span>
                      {suggestion.suggested ? <span className="shrink-0 rounded-md border px-1 text-muted-foreground">Sugerida</span> : null}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {dayOf(purchase.postedDate)} · {accountName(purchase.accountId)} · {purchase.installments}× {formatBRL(purchase.lastAmount)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="font-mono tabular-nums">{formatBRL(purchase.estimatedTotal)}</span>
                    <span className="text-muted-foreground">
                      {purchase.paidCount} de {purchase.installments} pagas · {situation}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      />
      <FieldError errors={[formState.errors.purchaseId]} />
    </form>
  )
}
```

- [ ] **Passo 6: naming.md** — em `.claude/rules/naming.md`, troque a linha:

`| \`apps/web/src/routes/**/*dialog*\` | **6** | dois diálogos (\`import-dialog\`, \`group-dialog\`) × três |`

por:

`| \`apps/web/src/routes/**/*dialog*\` | **9** | três diálogos (\`import-dialog\`, \`group-dialog\`, \`purchase-link-dialog\`) × três |`

- [ ] **Passo 7: verificar**

Run: `cd apps/web && npx tsx --test scripts/checks/rule-globs.test.ts scripts/checks/form-domain-link.test.ts scripts/checks/identifier-language.test.ts src/routes/planos/-components/purchase-link-dialog-schema.test.ts`
Esperado: PASS. Depois `pnpm type:check` e `pnpm lint` (nenhum aviso novo). Formatação: `pnpm exec biome format --write apps/web/src/routes/planos/-components/purchase-link-dialog.tsx apps/web/src/routes/planos/-components/purchase-link-dialog-schema.ts apps/web/src/routes/planos/-components/purchase-link-dialog-schema.test.ts`.

---

### Tarefa 8: A linha do plano ligado — medidor, células e ações

**Arquivos:**
- Criar: `apps/web/src/routes/planos/-components/purchase-meter.tsx`
- Modificar: `apps/web/src/routes/planos/-components/plan-row-controls.tsx`
- Modificar: `apps/web/src/routes/planos/-components/planos-data-table.tsx`

**Interfaces:**
- Consome: `InstallmentPurchase`, `planPurchase`, `monthOfDate` (Tarefa 1).
- Produz: `PlanosDataTable` ganha as props `purchases: InstallmentPurchase[]`, `onLinkPurchase: (plan: Plan) => void`, `onUnlinkPurchase: (plan: Plan) => void`. `PaymentCell`, `InstallmentsCell`, `MonthCell` ganham `purchase?: InstallmentPurchase`.

- [ ] **Passo 1: medidor** — `purchase-meter.tsx`:

```tsx
import { monthOfDate, type InstallmentPurchase } from '@wlet/domain/purchases'
import { formatBRL, formatMonthShort } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'

/** Acima disto os segmentos ficam finos demais para contar, e o medidor vira uma barra contínua. */
const MAX_SEGMENTS = 24

/**
 * Quanto de uma compra parcelada já foi pago.
 *
 * O verde é de SITUAÇÃO — "isto já saiu do bolso" —, como o cartão de orçamento, e não cor de série: o
 * medidor mora na linha, fora de gráfico, então não disputa com a identidade das categorias
 * (`dataviz.md` §1). A parte que falta é OCA, o mesmo idioma de "ainda não aconteceu" do app.
 *
 * O desenho é `aria-hidden` e o texto ao lado diz a mesma coisa: contorno e cor não chegam a quem ouve.
 */
export function PurchaseMeter({ purchase }: { purchase: InstallmentPurchase }) {
  const paid = Math.min(purchase.paidCount, purchase.installments)
  const total = purchase.installments
  const suffix = purchase.completed ? ' · quitada' : purchase.ended ? ` · encerrada em ${formatMonthShort(monthOfDate(purchase.latest.date))}` : ''

  return (
    <span className="flex items-center gap-2 font-normal">
      {total <= MAX_SEGMENTS ? (
        <span aria-hidden className="flex gap-0.5">
          {Array.from({ length: total }, (_, index) => (
            // A posição é a identidade do segmento: o índice é a chave certa aqui.
            <span key={index} className={cn('h-1.5 w-3 rounded-[2px]', index < paid ? 'bg-[var(--status-good)]' : 'border border-border')} />
          ))}
        </span>
      ) : (
        <span aria-hidden className="relative h-1.5 w-24 overflow-hidden rounded-[2px] border border-border">
          <span className="absolute inset-y-0 left-0 bg-[var(--status-good)]" style={{ width: `${(paid / total) * 100}%` }} />
        </span>
      )}
      <span className="text-muted-foreground tabular-nums">
        {paid} de {total} pagas · {formatBRL(purchase.paidAmount)}
        {suffix}
      </span>
    </span>
  )
}
```

- [ ] **Passo 2: células somente leitura** — em `plan-row-controls.tsx`:

Acrescente aos imports: `import { formatMonthShort } from '@wlet/lib/format'` (junto de `formatBRL`: `import { formatBRL, formatMonthShort } from '@wlet/lib/format'`) e `import type { InstallmentPurchase } from '@wlet/domain/purchases'`.

`PaymentCell`: acrescente `purchase?: InstallmentPurchase` à tipagem das props (desestruture `purchase`) e, como primeira linha do corpo:

```tsx
  // Ligado a uma compra, a forma é a da compra — editá-la aqui não mudaria nada que a previsão lê.
  if (purchase) return <span className="px-2 text-muted-foreground">Parcelado</span>
```

`InstallmentsCell`: acrescente `purchase?: InstallmentPurchase` (desestruture) e, DEPOIS do `useState` e ANTES de `if (plan.payment !== 'financed') return null`:

```tsx
  if (purchase) {
    return (
      <span className="truncate tabular-nums text-muted-foreground">
        {purchase.installments}× {formatBRL(purchase.lastAmount)}
      </span>
    )
  }
```

`MonthCell`: acrescente `purchase?: InstallmentPurchase` à tipagem (desestruture) e, como primeira linha do corpo:

```tsx
  if (purchase) return <span className="px-2 text-muted-foreground">{formatMonthShort(purchase.originMonth)}</span>
```

- [ ] **Passo 3: tabela** — em `planos-data-table.tsx`:

3a. Imports: troque `import { Pencil, Trash } from '@phosphor-icons/react'` por `import { LinkBreak, LinkSimple, Pencil, Trash } from '@phosphor-icons/react'`; acrescente `import { type InstallmentPurchase, planPurchase } from '@wlet/domain/purchases'` e `import { PurchaseMeter } from './purchase-meter'`.

3b. `COL_WIDTHS`: troque o último item `'w-16'` por `'w-24'`, e acrescente ao docblock da constante a frase: `A coluna de ações tem três botões — vincular, editar e remover.`

3c. Na `interface Handlers`, acrescente:

```ts
  /** Abre a escolha da compra parcelada que este plano virou. */
  onLinkPurchase: (plan: Plan) => void
  /** Pede confirmação para desfazer o vínculo com a compra. */
  onUnlinkPurchase: (plan: Plan) => void
```

Na `interface Shared`, acrescente:

```ts
  /** As compras parceladas do conjunto inteiro, para resolver o vínculo de cada plano. */
  purchases: InstallmentPurchase[]
```

3d. Em `GroupBlock`, a desestruturação passa a incluir `purchases` nos parâmetros (`{ group, plans, disabled, monthsWithData, defaultMonth, purchases, ...handlers }`) e `onLinkPurchase, onUnlinkPurchase` na linha `const { ... } = handlers`.

3e. Em `GroupBlock`, troque `const total = plans.reduce((sum, plan) => sum + planTotal(plan), 0)` e as duas linhas de `toggleable`/`decidedCount` por:

```ts
  // Plano ligado vale o total da COMPRA, não o planejado: é o dinheiro que de fato sai.
  const valueOf = (plan: Plan) => {
    const link = planPurchase(plan, purchases)
    return link.status === 'linked' ? link.purchase.estimatedTotal : planTotal(plan)
  }
  const total = plans.reduce((sum, plan) => sum + valueOf(plan), 0)
  // O que o checkbox do grupo alterna: descartado fica de fora, e ligado também — a compra já foi feita,
  // e "voltar a estudo" não desfaz compra nenhuma. Parcial é o traço.
  const toggleable = plans.filter((plan) => plan.status !== 'discarded' && !plan.purchaseId)
  const decidedCount = toggleable.filter((plan) => plan.status === 'decided').length
```

(O resumo `N planos · M decididos` do cabeçalho continua usando `decidedCount`.)

3f. Dentro de `plans.map((plan) => {`, logo depois de `const discarded = plan.status === 'discarded'`, acrescente:

```ts
              const link = planPurchase(plan, purchases)
              const purchase = link.status === 'linked' ? link.purchase : undefined
```

3g. Checkbox da linha: troque `disabled={disabled}` por `disabled={disabled || link.status !== 'none'}` e acrescente logo acima do `<Checkbox` um comentário JSX: `{/* Ligado a uma compra, o plano está decidido por fato: a caixinha fica marcada e travada. */}`.

3h. Célula do nome: troque o `<span className="flex min-w-0 items-center gap-2">…</span>` inteiro por:

```tsx
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('truncate font-medium', discarded && 'text-muted-foreground line-through')}>{plan.label}</span>
                        <CategoryBadge value={plan.categoryId} className="shrink-0" />
                        {/* O badge de situação sobrou para UM caso: "Descartado", que a caixinha não
                            sabe dizer — desmarcada, ela significa "em estudo". */}
                        {discarded ? <EnumBadge option={planStatuses.find((s) => s.value === 'discarded')} value="discarded" className="shrink-0" /> : null}
                      </span>
                      {purchase ? <PurchaseMeter purchase={purchase} /> : null}
                      {link.status === 'broken' ? <span className="text-muted-foreground">Compra não encontrada</span> : null}
                    </span>
```

3i. Célula do valor: troque `<TableCell className="text-right font-mono tabular-nums">{formatBRL(planTotal(plan))}</TableCell>` por:

```tsx
                  <TableCell className="text-right font-mono tabular-nums">
                    {/* Ligado, o valor é o da compra; o planejado fica embaixo, riscado, só quando diverge
                        mais de um real — senão seria ruído de centavo. */}
                    <span className="flex flex-col items-end">
                      <span>{formatBRL(valueOf(plan))}</span>
                      {purchase && Math.abs(purchase.estimatedTotal - planTotal(plan)) > 1 ? <span className="text-muted-foreground line-through">{formatBRL(planTotal(plan))}</span> : null}
                    </span>
                  </TableCell>
```

3j. Células de forma, parcelas e mês: passe `purchase={purchase}` para `PaymentCell`, `InstallmentsCell` e `MonthCell`.

3k. Ações da linha: dentro do `<span className="flex justify-end gap-0.5 opacity-0 …">`, ANTES do tooltip de editar, acrescente:

```tsx
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            link.status === 'none' ? (
                              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Vincular ${plan.label} a uma compra`} onClick={() => onLinkPurchase(plan)}>
                                <LinkSimple />
                              </Button>
                            ) : (
                              <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Desvincular ${plan.label} da compra`} onClick={() => onUnlinkPurchase(plan)}>
                                <LinkBreak />
                              </Button>
                            )
                          }
                        />
                        <TooltipContent>{link.status === 'none' ? 'Vincular a uma compra parcelada' : 'Desvincular da compra'}</TooltipContent>
                      </Tooltip>
```

3l. `PlanosDataTable` repassa as props novas: como `...shared` já é espalhado em `GroupBlock`, basta a tipagem de `Shared`/`Handlers` (3c) — confira que `purchases`, `onLinkPurchase`, `onUnlinkPurchase` chegam ao `GroupBlock` via `{...shared}`.

- [ ] **Passo 4: verificar** — a tela ainda não passa as props novas, então `pnpm type:check` vai acusar `-content.tsx` (props obrigatórias faltando). Isso é esperado e é resolvido na Tarefa 9; confira que NENHUM outro erro aparece além desse arquivo. Rode `pnpm lint` (nenhum aviso novo nos arquivos desta tarefa). Formatação: `pnpm exec biome format --write apps/web/src/routes/planos/-components/purchase-meter.tsx apps/web/src/routes/planos/-components/plan-row-controls.tsx apps/web/src/routes/planos/-components/planos-data-table.tsx`.

---

### Tarefa 9: A tela — mutações, confirmação, KPIs, realce, sensores e documentação

**Arquivos:**
- Modificar: `apps/web/src/routes/planos/-content.tsx`
- Modificar: `apps/web/src/routes/planos/-metric-definitions.ts`
- Modificar: `apps/web/src/routes/planos/-components/plan-schedule-chart.tsx`
- Modificar: `apps/web/scripts/checks/invalidation.test.ts`, `apps/web/scripts/checks/confirmation.test.ts`
- Modificar: `CLAUDE.md`

**Interfaces:**
- Consome: tudo das Tarefas 1–8. Mutações na tela chamam-se `attachPurchase` e `detachPurchase` — NÃO `linkPurchase`/`unlinkPurchase`: o sensor de confirmação procura `nomeDaMutação(` e o `mutationFn` contém `services().plans.unlinkPurchase(`, que seria acusado como disparo fora do `AlertDialogAction`.

- [ ] **Passo 1: sensores que falham** — em `apps/web/scripts/checks/invalidation.test.ts`, na entrada `planos/-content.tsx`, troque `writes: 8` por `writes: 10` e o comentário por: `// Criar, editar e remover plano; criar, renomear e remover grupo; decidir o grupo inteiro; vincular e desvincular compra; importar a lista inteira. A invalidação de \`plans\` move TRÊS telas: a lista, a Visão geral e a Previsão leem o mesmo cache, porque plano decidido entra nos meses futuros.` (mantenha em três linhas de comentário `//`).

Em `apps/web/scripts/checks/confirmation.test.ts`, troque `{ screen: 'planos/-content.tsx', prompts: 2, mutations: ['deletePlan', 'deleteGroup'] },` por:

```ts
  { screen: 'planos/-content.tsx', prompts: 3, mutations: ['deletePlan', 'deleteGroup', 'detachPurchase'] },
```

Run: `cd apps/web && npx tsx --test scripts/checks/invalidation.test.ts scripts/checks/confirmation.test.ts`
Esperado: FAIL nas entradas de planos.

- [ ] **Passo 2: realce `'committed'`** — em `plan-schedule-chart.tsx`, na `interface PlanHighlight`, troque `key: 'decided' | 'considering'` por:

```ts
  /** Em qual série ele cai: as duas de plano, ou o contratado quando o plano está ligado a uma compra. */
  key: 'decided' | 'considering' | 'committed'
```

- [ ] **Passo 3: imports e compras em `-content.tsx`**

Acrescente aos imports (os ícones de vincular/desvincular moram na tabela; a tela não importa ícone novo):

```ts
import { groupInstallmentPurchases, latestInvoiceByAccount, planPurchase, suggestPurchases } from '@wlet/domain/purchases'
import { PurchaseLinkDialog } from './-components/purchase-link-dialog'
```

Troque o import de `@/lib/finance` para incluir `TRANSACTIONS`: `import { ACCOUNT_MAP, lastMonthWithData, monthsBetween, projectionHorizon, shiftMonth, TRANSACTIONS } from '@/lib/finance'`.

- [ ] **Passo 4: mutações** — depois do bloco `const { mutate: renameGroup, isPending: renamingGroup } = useMutation({ … })`, acrescente:

```ts
  const { mutate: attachPurchase, isPending: attachingPurchase } = useMutation({
    // O estabelecimento e as parcelas viajam nas variáveis: o serviço devolve o plano, e o aviso
    // precisa dizer A QUAL compra ele foi ligado.
    mutationFn: ({ planId, purchaseId }: { planId: string; purchaseId: string; merchant: string; installments: number }) => services().plans.linkPurchase(planId, purchaseId),
    onSuccess: (plan, { merchant, installments }) => {
      apply()
      toast.success(`Plano "${plan.label}" ligado à compra ${merchant} · ${installments}×`)
    },
  })

  const { mutate: detachPurchase, isPending: detachingPurchase } = useMutation({
    mutationFn: ({ id }: { id: string }) => services().plans.unlinkPurchase(id),
    onSuccess: (plan) => {
      apply()
      toast.success(`Plano "${plan.label}" desvinculado da compra`)
    },
  })
```

Troque a linha do `saving` e o docblock acima dela por:

```ts
  /** Qualquer escrita em voo trava a lista: as dez reescrevem o mesmo catálogo. */
  const saving = creatingPlan || updatingPlan || deletingPlan || creatingGroup || deletingGroup || settingGroupStatus || renamingGroup || attachingPurchase || detachingPurchase || importing
```

- [ ] **Passo 5: estado** — junto dos outros `useState`, acrescente:

```ts
  // O plano cuja compra está sendo escolhida, e o que espera confirmação para ser desvinculado. Um
  // diálogo de cada, com o estado guardando QUEM — o mesmo desenho das remoções.
  const [linking, setLinking] = useState<Plan | null>(null)
  const [planPendingUnlink, setPlanPendingUnlink] = useState<Plan | null>(null)
```

- [ ] **Passo 6: compras e KPIs** — logo depois de `const nextMonth = shiftMonth(lastMonth, 1)`, acrescente:

```ts
  // As compras parceladas do conjunto INTEIRO, não do recorte: o vínculo de um plano não pode sumir
  // porque a pessoa olhou só a PJ. O conjunto é fixado no boot, então isto é calculado uma vez.
  const purchases = useMemo(() => groupInstallmentPurchases(TRANSACTIONS, latestInvoiceByAccount(TRANSACTIONS)), [])
  /** O que um plano vale: o total da compra quando ligado, o planejado quando não. */
  const valueOf = (plan: Plan) => {
    const link = planPurchase(plan, purchases)
    return link.status === 'linked' ? link.purchase.estimatedTotal : planTotal(plan)
  }
```

Troque as linhas de `totalDecided`, `dueNext` e `undated` por:

```ts
  const totalDecided = decided.reduce((s, p) => s + valueOf(p), 0)
  const totalConsidering = items.filter((p) => p.status === 'considering').reduce((s, p) => s + planTotal(p), 0)
  // Plano ligado cai pela parcela REAL do mês, e só enquanto a série roda.
  const dueNext = decided.reduce((sum, plan) => {
    const link = planPurchase(plan, purchases)
    if (link.status === 'linked') return sum + (!link.purchase.ended && link.purchase.remainingMonths.includes(nextMonth) ? link.purchase.lastAmount : 0)
    if (link.status === 'broken') return sum
    return planOccursIn(plan, nextMonth) ? sum + installmentAmount(plan) : sum
  }, 0)
  // Decidido SEM mês é dinheiro que o KPI soma e a previsão não mostra em lugar nenhum. Plano ligado
  // não entra na conta: ele tem data — a das parcelas — mesmo sem `month`.
  const unlinkedDecided = decided.filter((p) => !p.purchaseId)
  const undated = unlinkedDecided.length - scheduledPlans(unlinkedDecided).length
```

(Se já existir uma linha `totalConsidering` idêntica, não a duplique.)

- [ ] **Passo 7: realce** — substitua o corpo do `useMemo` de `highlight` por:

```ts
  const highlight = useMemo<PlanHighlight | undefined>(() => {
    if (!pointed || pointed.status === 'discarded') return undefined
    const link = planPurchase(pointed, purchases)
    if (link.status === 'broken') return undefined
    if (link.status === 'linked') {
      // Ligado, o plano mora dentro da fatia "Contratado": acende-se a parcela dele em cada mês que falta.
      if (link.purchase.ended) return undefined
      const byMonth: Record<string, number> = {}
      for (const month of link.purchase.remainingMonths) byMonth[month] = link.purchase.lastAmount
      return { key: 'committed', byMonth }
    }
    const months = planMonths(pointed)
    if (months.length === 0) return undefined
    const value = installmentAmount(pointed)
    const byMonth: Record<string, number> = {}
    for (const month of months) byMonth[month] = (byMonth[month] ?? 0) + value
    return { key: pointed.status === 'decided' ? 'decided' : 'considering', byMonth }
  }, [pointed, purchases])
```

- [ ] **Passo 8: tabela** — no `<PlanosDataTable …>`, acrescente as props:

```tsx
            purchases={purchases}
            onLinkPurchase={setLinking}
            onUnlinkPurchase={setPlanPendingUnlink}
```

- [ ] **Passo 9: diálogos** — logo depois do `<AlertDialog>` de remover grupo, acrescente:

```tsx
      {/* Desvincular devolve o plano à previsão pelos próprios números — é ação instantânea, e a
          `mutation-confirmation.md` §1 não admite disparo direto no clique. */}
      <AlertDialog open={planPendingUnlink !== null} onOpenChange={(open) => !open && setPlanPendingUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular da compra?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{planPendingUnlink?.label}</strong> deixa de acompanhar as parcelas e volta a entrar na previsão pelo preço e pelo mês planejados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              onClick={() => {
                if (planPendingUnlink) detachPurchase({ id: planPendingUnlink.id })
                setPlanPendingUnlink(null)
              }}
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PurchaseLinkDialog
        plan={linking}
        suggestions={linking ? suggestPurchases(linking, purchases, items, lastMonthWithData()) : []}
        accountName={(accountId) => ACCOUNT_MAP[accountId]?.name ?? accountId}
        onOpenChange={(open) => !open && setLinking(null)}
        onSubmit={(suggestion) => {
          if (linking) attachPurchase({ planId: linking.id, purchaseId: suggestion.purchase.seen[0].id, merchant: suggestion.purchase.merchant, installments: suggestion.purchase.installments })
          setLinking(null)
        }}
      />
```

- [ ] **Passo 10: definições dos KPIs** — em `-metric-definitions.ts`:

- `decided.howItIsCalculated`: acrescente ao fim a frase ` Plano ligado a uma compra parcelada soma o total DA COMPRA — as parcelas pagas mais as que faltam, estimadas pela última —, não o preço planejado.`
- `nextMonth.howItIsCalculated`: acrescente ao fim ` Plano ligado a uma compra conta a parcela REAL que cai naquele mês, e nada se a série foi encerrada.`
- `schedule.howItIsCalculated`: acrescente ao fim ` Plano ligado a uma compra também fica de fora: as parcelas dele já estão na fatia "Contratado" do gráfico.`

- [ ] **Passo 11: rodar os sensores e a suíte**

Run: `pnpm --dir apps/web run check 2>&1 | grep -E "ℹ (tests|pass|fail)|✖" | head`
Esperado: 0 fail.

Run: `pnpm type:check` → 11 tarefas com sucesso. `pnpm lint` → só os 7 avisos pré-existentes. `pnpm --dir apps/api run check` → 0 fail.

- [ ] **Passo 12: conferir por mutação** — mova `detachPurchase({ id: … })` para fora do `AlertDialogAction` (por exemplo, direto no `onUnlinkPurchase`) e confirme que `confirmation.test.ts` falha; restaure.

- [ ] **Passo 13: CLAUDE.md** — em `CLAUDE.md`, no fim do item que começa com `- **A linha da lista de Planos EDITA, e a gaveta ficou para compor.**`, acrescente:

```
 **Um plano pode virar uma COMPRA PARCELADA que já está no cartão** (`purchaseId`, o id de uma parcela). Não existe id de compra: as parcelas se reconhecem pela chave `conta | data da compra | mês de origem | descrição crua | parcelas` (`@wlet/domain/purchases`), e é a data da compra que separa duas compras com a mesma descrição — a hospedagem de maio/26, estornada, tem a mesma `AIRBNB PAGAM*AIRB` da de julho. O agrupamento é UM: a previsão (`committedInstallments`) e o vínculo leem o mesmo módulo. **Ligado, a compra manda**: o plano sai de `sources.plan`, de `forecastItems` e da agenda — as parcelas restantes já são contratado, e antes do vínculo o mesmo mês contava duas vezes —, a caixinha trava marcada, forma/parcelas/mês viram texto da compra e a linha ganha um medidor verde de parcelas pagas. O verde ali é de SITUAÇÃO, na linha, e não cor de série de gráfico. O vínculo nasce só por escolha (diálogo com sugestão por parcelas, total a 2%, categoria e mês a 1), nunca no ingest; uma compra liga a um plano só (`PurchaseAlreadyLinkedError`), e desvincular pede confirmação. Parcela âncora que some do conjunto deixa o plano com "Compra não encontrada", em vez de escondê-lo.
```

- [ ] **Passo 14: formatação** — `pnpm exec biome format --write apps/web/src/routes/planos/-content.tsx apps/web/src/routes/planos/-metric-definitions.ts apps/web/src/routes/planos/-components/plan-schedule-chart.tsx apps/web/scripts/checks/invalidation.test.ts apps/web/scripts/checks/confirmation.test.ts`.

- [ ] **Passo 15: conferência visual (manual, fora do alcance do subagente)** — registre no relatório final que ela exige o conjunto no servidor (reprocessar em Meus dados ou importar o pacote), e o que olhar: medidor "2 de 6 pagas · R$ 1.874,08" no Airbnb Arraial, ícone de vincular/desvincular, diálogo com a compra de julho como "Sugerida" no topo, e o gráfico de Planos sem a fatia "Decidido" duplicando o "Contratado".
