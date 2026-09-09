/**
 * Gera um conjunto FICTÍCIO em `src/generated/`, para o app abrir num clone recém-feito.
 *
 * `docs/` e `src/generated/` não são versionados — são dado pessoal. Sem eles, os sete
 * `import ... from '@/generated/*.json'` não resolvem e nem o `tsc` nem o Vite completam.
 * Este script preenche essa lacuna com dados inventados, gerados por código em vez de
 * versionados como JSON: o que entra no repositório é a receita, não a massa.
 *
 * `pnpm run setup` roda isto quando `src/generated/` está vazio. Com extratos reais em `docs/`,
 * `pnpm ingest` sobrescreve tudo — e é ele quem manda.
 *
 * Nada aqui descreve pessoa, empresa ou conta real.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Account, DatasetMeta, Transaction, Transfer } from '../src/data/types.ts'
import { BUDGET } from './budget.config.ts'
import { GOALS } from './goals.config.ts'
import { matchPlanned, matchReceivables } from '../src/lib/ingest/matching.ts'
import { PLANNED_ENTRIES } from './planned.config.ts'
import { RECEIVABLES } from './receivables.config.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src', 'generated')

/** Oito meses até o corrente: o último fica parcial, como um extrato baixado no meio do mês. */
const MONTHS_BACK = 7

/**
 * Gerador determinístico: o mesmo clone produz o mesmo dataset, então uma captura de tela
 * ou um número citado numa issue continuam valendo amanhã.
 */
let seed = 20260101
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
function around(base: number, spread: number): number {
  return Math.round((base + (rand() - 0.5) * spread) * 100) / 100
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + by
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function day(month: string, d: number): string {
  return `${month}-${String(d).padStart(2, '0')}`
}

const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const months = Array.from({ length: MONTHS_BACK + 1 }, (_, i) => shiftMonth(currentMonth, i - MONTHS_BACK))
const lastDayOfCurrent = Math.min(now.getDate(), 28)

const transactions: Transaction[] = []
const transfers: Transfer[] = []
let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${String(counter).padStart(4, '0')}`
}

interface TxInput {
  accountId: string
  entity: 'PF' | 'PJ'
  date: string
  amount: number
  description: string
  merchant: string
  categoryId: string
  kind?: 'statement' | 'invoice'
  installment?: { current: number; total: number }
  invoice?: { dueDate: string; month: string }
}

function add(input: TxInput): Transaction {
  const tx: Transaction = {
    id: nextId('seed'),
    accountId: input.accountId,
    entity: input.entity,
    date: input.date,
    postedDate: input.date,
    amount: input.amount,
    description: input.description,
    rawDescription: input.description,
    merchant: input.merchant,
    kind: input.kind ?? 'statement',
    categoryId: input.categoryId,
    categoryRule: 'seed',
    installment: input.installment ?? null,
    invoice: input.invoice ?? null,
    transferId: null,
    transferKind: null,
    counterpartAccountId: null,
    receivableId: null,
    plannedId: null,
    source: 'seed',
    fitId: null,
  }
  transactions.push(tx)
  return tx
}

/** Cria as duas pontas de uma transferência já pareadas, como o ingest as entrega. */
function transfer(opts: { kind: Transfer['kind']; from: string; to: string; fromEntity: 'PF' | 'PJ'; toEntity: 'PF' | 'PJ'; date: string; amount: number; label: string; categoryId: string }) {
  const out = add({ accountId: opts.from, entity: opts.fromEntity, date: opts.date, amount: -opts.amount, description: opts.label, merchant: opts.label, categoryId: opts.categoryId })
  const into = add({ accountId: opts.to, entity: opts.toEntity, date: opts.date, amount: opts.amount, description: opts.label, merchant: opts.label, categoryId: opts.categoryId })
  const id = nextId('transfer')
  for (const [tx, other] of [
    [out, opts.to],
    [into, opts.from],
  ] as const) {
    tx.transferId = id
    tx.transferKind = opts.kind
    tx.counterpartAccountId = other
  }
  transfers.push({
    id,
    kind: opts.kind,
    date: opts.date,
    amount: opts.amount,
    fromAccountId: opts.from,
    toAccountId: opts.to,
    fromTransactionId: out.id,
    toTransactionId: into.id,
    description: opts.label,
  })
}

const CARD_PURCHASES: { merchant: string; categoryId: string; base: number; spread: number }[] = [
  { merchant: 'Supermercado Bom Preço', categoryId: 'mercado', base: 320, spread: 140 },
  { merchant: 'Padaria da Esquina', categoryId: 'restaurantes', base: 48, spread: 30 },
  { merchant: 'Cantina Vizinha', categoryId: 'restaurantes', base: 96, spread: 60 },
  { merchant: 'Aplicativo de Corrida', categoryId: 'transporte', base: 62, spread: 40 },
  { merchant: 'Streaming de Vídeo', categoryId: 'assinaturas', base: 39.9, spread: 0 },
  { merchant: 'Streaming de Música', categoryId: 'assinaturas', base: 21.9, spread: 0 },
  { merchant: 'Farmácia Central', categoryId: 'saude', base: 88, spread: 60 },
  { merchant: 'Livraria do Centro', categoryId: 'lazer', base: 74, spread: 50 },
  { merchant: 'Loja de Informática', categoryId: 'tecnologia', base: 210, spread: 120 },
  { merchant: 'Loja de Roupas', categoryId: 'compras', base: 180, spread: 110 },
]

/** Uma compra parcelada por cartão, para a previsão ter parcela já contratada para projetar. */
const INSTALLMENT_PURCHASE = { merchant: 'Notebook Loja de Informática', categoryId: 'tecnologia', amount: 583.25, total: 10, startsAt: 3 }

/**
 * As compras de cartão do mês.
 *
 * `lastDay` trava a data no último dia que o mês "já viveu". Sem ele, o mês em curso ganhava
 * compras datadas depois do próprio corte, `lastDateWithData()` ia parar no futuro e contas
 * que ainda nem venceram apareciam em atraso.
 */
function seedCard(accountId: string, purchaseMonth: string, howMany: number, lastDay: number) {
  const invoiceMonth = shiftMonth(purchaseMonth, 1)
  const invoice = { dueDate: day(invoiceMonth, 10), month: invoiceMonth }
  let total = 0
  for (let i = 0; i < howMany; i++) {
    const item = pick(CARD_PURCHASES)
    const amount = around(item.base, item.spread)
    total += amount
    add({
      accountId,
      entity: 'PF',
      date: day(purchaseMonth, Math.min(lastDay, 2 + Math.floor(rand() * 24))),
      amount: -amount,
      description: item.merchant,
      merchant: item.merchant,
      categoryId: item.categoryId,
      kind: 'invoice',
      invoice,
    })
  }
  return total
}

for (const [index, month] of months.entries()) {
  const isCurrent = month === currentMonth
  const lastDay = isCurrent ? lastDayOfCurrent : 28

  // --- PJ: receita do cliente, impostos, contabilidade, retirada para a PF ---
  add({
    accountId: 'inter-pj',
    entity: 'PJ',
    date: day(month, Math.min(5, lastDay)),
    amount: 10000,
    description: 'Pagamento de cliente — contrato mensal',
    merchant: 'Cliente Fictício Ltda',
    categoryId: 'receita-pj',
  })
  if (lastDay >= 15) {
    add({ accountId: 'inter-pj', entity: 'PJ', date: day(month, 15), amount: -around(820, 120), description: 'Impostos do mês', merchant: 'Receita Federal', categoryId: 'impostos' })
    add({ accountId: 'inter-pj', entity: 'PJ', date: day(month, 15), amount: -350, description: 'Honorários contábeis', merchant: 'Contabilidade Fictícia', categoryId: 'contabilidade' })
  }
  if (lastDay >= 8) {
    transfer({ kind: 'internal', from: 'inter-pj', to: 'xp-conta', fromEntity: 'PJ', toEntity: 'PF', date: day(month, 8), amount: 6000, label: 'Pix para conta pessoal', categoryId: 'transferencia' })
  }

  // --- PF: contas fixas, aporte e o repasse para a conta do outro banco ---
  if (lastDay >= 12) {
    add({ accountId: 'xp-conta', entity: 'PF', date: day(month, 10), amount: -2400, description: 'Aluguel', merchant: 'Imobiliária Fictícia', categoryId: 'moradia' })
    // Metade do aluguel volta: é o que dá o que conciliar ao `receivables.config.example.ts`.
    // Sem esta entrada o clone abre a tela de Cobranças com tudo em atraso.
    add({
      accountId: 'xp-conta',
      entity: 'PF',
      date: day(month, 15),
      amount: 1200,
      description: 'Pix recebido de Colega de Apartamento',
      merchant: 'Colega de Apartamento',
      categoryId: 'pix-recebido',
    })
    add({ accountId: 'xp-conta', entity: 'PF', date: day(month, 12), amount: -around(95, 20), description: 'Plano de celular', merchant: 'Operadora Fictícia', categoryId: 'telefonia' })
    transfer({
      kind: 'investment',
      from: 'xp-conta',
      to: 'xp-investimentos',
      fromEntity: 'PF',
      toEntity: 'PF',
      date: day(month, 12),
      amount: 1500,
      label: 'Aplicação em renda fixa',
      categoryId: 'investimentos',
    })
    transfer({
      kind: 'internal',
      from: 'xp-conta',
      to: 'nubank-conta',
      fromEntity: 'PF',
      toEntity: 'PF',
      date: day(month, 12),
      amount: 1200,
      label: 'Transferência entre contas próprias',
      categoryId: 'transferencia',
    })
  }
  if (lastDay >= 20) {
    add({ accountId: 'nubank-conta', entity: 'PF', date: day(month, 20), amount: around(260, 180), description: 'Pix recebido', merchant: 'Reembolso de amigo', categoryId: 'pix-recebido' })
  }

  // --- Cartões: as compras do mês caem na fatura do mês seguinte ---
  const xpTotal = seedCard('xp-cartao', month, lastDay >= 2 ? 6 : 0, lastDay)
  const nubankTotal = seedCard('nubank-cartao', month, lastDay >= 2 ? 4 : 0, lastDay)

  // Parcelas de uma compra antiga: uma por mês, deslocadas, como o ingest as entrega.
  if (index >= INSTALLMENT_PURCHASE.startsAt) {
    const current = index - INSTALLMENT_PURCHASE.startsAt + 1
    add({
      accountId: 'xp-cartao',
      entity: 'PF',
      date: day(month, 6),
      amount: -INSTALLMENT_PURCHASE.amount,
      description: `${INSTALLMENT_PURCHASE.merchant} — parcela ${current}/${INSTALLMENT_PURCHASE.total}`,
      merchant: INSTALLMENT_PURCHASE.merchant,
      categoryId: INSTALLMENT_PURCHASE.categoryId,
      kind: 'invoice',
      installment: { current, total: INSTALLMENT_PURCHASE.total },
      invoice: { dueDate: day(shiftMonth(month, 1), 10), month: shiftMonth(month, 1) },
    })
  }

  // Pagamento das faturas do mês anterior, que vencem neste.
  if (index > 0 && lastDay >= 10) {
    transfer({
      kind: 'card-payment',
      from: 'xp-conta',
      to: 'xp-cartao',
      fromEntity: 'PF',
      toEntity: 'PF',
      date: day(month, 10),
      amount: Math.round(xpTotal * 0.95 * 100) / 100,
      label: 'Pagamento de fatura',
      categoryId: 'pagamento-fatura',
    })
    transfer({
      kind: 'card-payment',
      from: 'nubank-conta',
      to: 'nubank-cartao',
      fromEntity: 'PF',
      toEntity: 'PF',
      date: day(month, 10),
      amount: Math.round(nubankTotal * 0.95 * 100) / 100,
      label: 'Pagamento de fatura',
      categoryId: 'pagamento-fatura',
    })
  }
}

const ACCOUNT_SEEDS: Omit<Account, 'coverage' | 'reportedBalance' | 'sources' | 'transactionCount'>[] = [
  { id: 'inter-pj', name: 'Inter PJ', bank: 'Banco Inter', bankCode: '077', type: 'checking', entity: 'PJ', holder: 'Sua Empresa Ltda', externalId: '000000001' },
  { id: 'nubank-conta', name: 'Nubank Conta', bank: 'Nubank', bankCode: '260', type: 'checking', entity: 'PF', holder: 'Seu Nome', externalId: '000000002' },
  { id: 'nubank-cartao', name: 'Nubank Cartão', bank: 'Nubank', bankCode: '260', type: 'credit-card', entity: 'PF', holder: 'Seu Nome', externalId: '000000003' },
  { id: 'xp-conta', name: 'XP Conta', bank: 'Banco XP', bankCode: '348', type: 'checking', entity: 'PF', holder: 'Seu Nome', externalId: '000000004' },
  { id: 'xp-cartao', name: 'XP Cartão', bank: 'Banco XP', bankCode: '348', type: 'credit-card', entity: 'PF', holder: 'Seu Nome', externalId: '000000005' },
  { id: 'xp-investimentos', name: 'XP Investimentos', bank: 'Banco XP', bankCode: '348', type: 'investment', entity: 'PF', holder: 'Seu Nome', externalId: '__virtual_xp_invest__' },
]

const accounts: Account[] = ACCOUNT_SEEDS.map((profile) => {
  const own = transactions.filter((tx) => tx.accountId === profile.id)
  const dates = own.map((tx) => tx.date).sort()
  const balance = Math.round(own.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100
  return {
    ...profile,
    coverage: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    reportedBalance: dates.length ? { amount: balance, asOf: dates[dates.length - 1] } : null,
    sources: ['seed'],
    transactionCount: own.length,
  }
})

// O mesmo casamento do `pnpm ingest`, e não uma cópia: é ele que escreve `receivableId` e
// `plannedId` nos lançamentos. Sem esta etapa o dataset fictício nasce sem conciliação, e as
// telas de Cobranças e Pagamentos abrem um clone novo dizendo que tudo está em atraso.
matchReceivables(transactions, RECEIVABLES)
matchPlanned(transactions, PLANNED_ENTRIES)

transactions.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))

const meta: DatasetMeta = {
  generatedAt: new Date().toISOString(),
  sourceFiles: [{ path: 'scripts/seed.ts (dados fictícios)', account: '—', transactions: transactions.length, skippedAsDuplicate: false }],
  totals: { transactions: transactions.length, transfers: transfers.length, accounts: accounts.length },
  months,
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'accounts.json'), JSON.stringify(accounts, null, 2))
writeFileSync(join(OUT_DIR, 'transactions.json'), JSON.stringify(transactions, null, 2))
writeFileSync(join(OUT_DIR, 'transfers.json'), JSON.stringify(transfers, null, 2))
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
// Previsão, metas e teto não são inventados aqui: eles são declarados nos `*.config.ts`,
// e o `pnpm ingest` os copia da mesma forma. O seed só repete essa cópia.
writeFileSync(
  join(OUT_DIR, 'planned.json'),
  JSON.stringify(
    PLANNED_ENTRIES.map((entry) => ({ ...entry, exceptions: entry.exceptions ?? {} })),
    null,
    2,
  ),
)
writeFileSync(join(OUT_DIR, 'goals.json'), JSON.stringify(GOALS, null, 2))
writeFileSync(join(OUT_DIR, 'budget.json'), JSON.stringify(BUDGET, null, 2))
writeFileSync(join(OUT_DIR, 'receivables.json'), JSON.stringify(RECEIVABLES, null, 2))
// Sem carteira fictícia: a tela de Patrimônio já desenha a ausência, com a instrução de
// exportar os relatórios da B3. Inventar uma carteira ensinaria o número errado.
writeFileSync(join(OUT_DIR, 'trips.json'), JSON.stringify([], null, 2))
writeFileSync(join(OUT_DIR, 'investments.json'), JSON.stringify({ snapshot: null, series: [], income: [] }, null, 2))

console.log(`Dataset fictício gerado em src/generated/: ${transactions.length} lançamentos, ${transfers.length} transferências, ${months.length} meses (${months[0]} a ${months[months.length - 1]}).`)
console.log('Nada aqui é dado real. Coloque seus extratos em docs/ e rode `pnpm ingest` para substituir.')
