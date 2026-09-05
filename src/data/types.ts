import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Building2, CreditCard, Landmark, TrendingUp, Unlink, User, type LucideIcon } from 'lucide-react'

/** Significado da opção, não aparência: quem traduz tom em cor é o badge, num lugar só. */
export type EnumTone = 'neutral' | 'positive' | 'negative' | 'muted'

/**
 * As três faces de um valor de enum — o que o código compara, o que a pessoa lê e o que
 * ela vê — numa lista só, tipada pelo enum. Valor novo no tipo vira erro de compilação aqui.
 */
export interface EnumOption<T extends string> {
  value: T
  label: string
  /** Grafia curta para badge de coluna estreita. */
  shortLabel?: string
  /** Grafia plural para legenda/filtro agregado. */
  labelPlural?: string
  icon?: LucideIcon
  tone?: EnumTone
}

/** Como um lançamento conta num recorte. Quem decide o fluxo é `flowOf`, em src/lib/finance.ts. */
export type Flow = 'income' | 'expense' | 'transfer'

/**
 * A leitura do fluxo, numa lista só. O plural existe porque legenda e filtro agregam
 * ("Entradas") enquanto o badge de uma linha qualifica um lançamento ("Entrada").
 */
export const flowKinds: EnumOption<Flow>[] = [
  { value: 'income', label: 'Entrada', labelPlural: 'Entradas', icon: ArrowDownLeft, tone: 'positive' },
  { value: 'expense', label: 'Saída', labelPlural: 'Saídas', icon: ArrowUpRight, tone: 'neutral' },
  { value: 'transfer', label: 'Transferência', labelPlural: 'Transferências', icon: ArrowLeftRight, tone: 'muted' },
]

export type Entity = 'PF' | 'PJ'

export const entityKinds: EnumOption<Entity>[] = [
  { value: 'PF', label: 'Pessoa física', shortLabel: 'PF', icon: User, tone: 'neutral' },
  { value: 'PJ', label: 'Empresa', shortLabel: 'PJ', icon: Building2, tone: 'neutral' },
]

export type AccountType = 'checking' | 'credit-card' | 'investment'

export const accountsTypes: EnumOption<AccountType>[] = [
  { value: 'checking', label: 'Conta corrente', icon: Landmark, tone: 'neutral' },
  { value: 'credit-card', label: 'Cartão de crédito', icon: CreditCard, tone: 'neutral' },
  { value: 'investment', label: 'Conta investimento', icon: TrendingUp, tone: 'neutral' },
]

export interface Account {
  id: string
  name: string
  bank: string
  bankCode: string
  type: AccountType
  entity: Entity
  holder: string
  /** Identificador da conta no banco (ACCTID do OFX). */
  externalId: string
  /** Primeira e última data com movimentação conhecida. */
  coverage: { from: string; to: string } | null
  /** Saldo informado pelo banco no arquivo mais recente, quando existe. */
  reportedBalance: { amount: number; asOf: string } | null
  /** Arquivos que alimentaram esta conta. */
  sources: string[]
  transactionCount: number
}

export type TransferKind = 'internal' | 'card-payment' | 'investment' | 'unmatched-self'

export const transfersKinds: EnumOption<TransferKind>[] = [
  { value: 'internal', label: 'Entre contas', icon: ArrowLeftRight, tone: 'neutral' },
  { value: 'card-payment', label: 'Pagamento de fatura', icon: CreditCard, tone: 'neutral' },
  { value: 'investment', label: 'Investimento', icon: TrendingUp, tone: 'neutral' },
  { value: 'unmatched-self', label: 'Sem contraparte', icon: Unlink, tone: 'muted' },
]

export interface Installment {
  current: number
  total: number
}

export interface Transaction {
  id: string
  accountId: string
  entity: Entity
  /** Data de competência (AAAA-MM-DD). Para parcelas, a data da parcela. */
  date: string
  /** Data original registrada pelo banco. */
  postedDate: string
  /** Valor com sinal: negativo = saída, positivo = entrada. */
  amount: number
  description: string
  rawDescription: string
  merchant: string
  kind: 'statement' | 'invoice'
  categoryId: string
  categoryRule: string | null
  installment: Installment | null
  invoice: { dueDate: string; month: string } | null
  transferId: string | null
  transferKind: TransferKind | null
  counterpartAccountId: string | null
  source: string
  fitId: string | null
}

export interface Transfer {
  id: string
  kind: Exclude<TransferKind, 'unmatched-self'>
  date: string
  amount: number
  fromAccountId: string
  toAccountId: string
  fromTransactionId: string | null
  toTransactionId: string | null
  description: string
}

export interface DatasetMeta {
  generatedAt: string
  sourceFiles: { path: string; account: string; transactions: number; skippedAsDuplicate: boolean }[]
  totals: { transactions: number; transfers: number; accounts: number }
  months: string[]
}

export type Recurrence = 'monthly' | 'once' | 'installments'

export const plannedRecurrences: EnumOption<Recurrence>[] = [
  { value: 'monthly', label: 'Mensal', tone: 'neutral' },
  { value: 'once', label: 'Uma vez', tone: 'neutral' },
  { value: 'installments', label: 'Parcelado', tone: 'neutral' },
]

/**
 * Regra de previsão. Não é lançamento: é o que se declara que vai acontecer, e de onde
 * a previsão dos meses futuros é montada. Vive em `scripts/planned.config.ts` e o
 * `pnpm ingest` copia para `src/data/planned.json`.
 */
export interface Budget {
  /** Teto de saídas de um mês, no recorte consolidado. */
  monthlyLimit: number
  /** Fração do teto a partir da qual a tela avisa. */
  warnAt: number
}

/** Slot de cor da meta, entre os oito da paleta de séries. */
export type GoalSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface Goal {
  id: string
  label: string
  /** Quanto já foi guardado. */
  saved: number
  /** Quanto se pretende ter. */
  target: number
  /** Mês em que se quer chegar lá (AAAA-MM). */
  targetMonth: string
  /** Cor da barra: um dos slots de `--series-*`, declarado e não escolhido por posição. */
  slot: GoalSlot
}

export interface PlannedEntry {
  id: string
  /** A leitura deste eixo vem de `flowKinds`, acima — é subconjunto de `Flow`, sem lista própria. */
  kind: 'income' | 'expense'
  label: string
  /** Valor de cada ocorrência. */
  amount: number
  categoryId: string
  entity: Entity
  recurrence: Recurrence
  /** Primeiro mês em que a regra incide (AAAA-MM). */
  startMonth: string
  /** Só para `installments`: quantas ocorrências. */
  count?: number
  /** Só para `monthly`: último mês. Ausente significa sem prazo. */
  endMonth?: string
  /**
   * Mês → valor que substitui o padrão. Resolve "todo mês é X, menos em tal mês"
   * sem precisar de duas regras concorrentes.
   */
  exceptions?: Record<string, number>
}
