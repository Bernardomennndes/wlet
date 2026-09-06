import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CircleCheck,
  CircleMinus,
  Clock,
  CreditCard,
  Landmark,
  TrendingUp,
  TriangleAlert,
  Undo2,
  Unlink,
  User,
  type LucideIcon,
} from 'lucide-react'

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

/**
 * Como um lançamento conta num recorte. Quem decide o fluxo é `flowOf`, em src/lib/finance.ts.
 *
 * `reimbursement` é dinheiro que entra e não é seu: o rateio de uma despesa que você adiantou.
 * Ele não é entrada — somá-lo à receita infla os dois lados —, e não é transferência — o
 * dinheiro veio de outra pessoa. Ele ABATE a despesa que originou a cobrança.
 */
export type Flow = 'income' | 'expense' | 'transfer' | 'reimbursement'

/**
 * A leitura do fluxo, numa lista só. O plural existe porque legenda e filtro agregam
 * ("Entradas") enquanto o badge de uma linha qualifica um lançamento ("Entrada").
 */
export const flowKinds: EnumOption<Flow>[] = [
  { value: 'income', label: 'Entrada', labelPlural: 'Entradas', icon: ArrowDownLeft, tone: 'positive' },
  { value: 'expense', label: 'Saída', labelPlural: 'Saídas', icon: ArrowUpRight, tone: 'neutral' },
  { value: 'transfer', label: 'Transferência', labelPlural: 'Transferências', icon: ArrowLeftRight, tone: 'muted' },
  { value: 'reimbursement', label: 'Reembolso', labelPlural: 'Reembolsos', icon: Undo2, tone: 'muted' },
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
  /** Cobrança que esta entrada quita, quando o ingest casou uma. */
  receivableId: string | null
  /** Regra prevista que este lançamento cumpre, quando o ingest casou uma. */
  plannedId: string | null
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
/**
 * Como reconhecer, no extrato, o lançamento que cumpre uma regra declarada.
 *
 * Uma só para os dois lados: uma cobrança e uma conta a pagar fazem exatamente a mesma
 * pergunta ao extrato, e duas implementações do casamento divergiriam na primeira vez que
 * alguém afinasse uma delas.
 */
export interface MatchRule {
  /**
   * Trechos de nome da contraparte, já normalizados (maiúsculas, sem acento). São strings e
   * não RegExp porque este objeto viaja para `src/generated/*.json`.
   *
   * É uma LISTA porque quem deve e quem paga nem sempre são a mesma pessoa: mãe pagando pelo
   * filho, um sócio quitando pela empresa.
   */
  merchants: string[]
  /** Restringe a uma conta. Ausente significa qualquer conta do recorte. */
  accountId?: string
  /**
   * Faixa de valor aceita, quando a mesma contraparte cobre coisas diferentes.
   *
   * O padrão é casar QUALQUER valor — um rateio varia mês a mês, e exigir o número exato
   * deixaria a regra eternamente em aberto. Isto é a exceção: o mesmo pagador que quita as parcelas da
   * viagem também devolveu a conta de telefone de R$ 120,00 no mesmo mês.
   */
  amountBetween?: { min?: number; max?: number }
}

/**
 * Situação de uma ocorrência declarada num mês — cobrança ou conta a pagar.
 *
 * É a MESMA máquina de estados nos dois lados; o que muda é o substantivo que se lê, e por
 * isso há duas listas de rótulos sobre um tipo só. `settled` em vez de `received`/`paid`
 * justamente para o valor não pertencer a um dos lados.
 */
export type SettlementStatus = 'settled' | 'partial' | 'open' | 'overdue'

export const receivableStatuses: EnumOption<SettlementStatus>[] = [
  { value: 'settled', label: 'Recebida', labelPlural: 'Recebidas', icon: CircleCheck, tone: 'positive' },
  { value: 'partial', label: 'Parcial', labelPlural: 'Parciais', icon: CircleMinus, tone: 'neutral' },
  { value: 'open', label: 'Em aberto', labelPlural: 'Em aberto', icon: Clock, tone: 'muted' },
  { value: 'overdue', label: 'Em atraso', labelPlural: 'Em atraso', icon: TriangleAlert, tone: 'negative' },
]

export const payableStatuses: EnumOption<SettlementStatus>[] = [
  { value: 'settled', label: 'Paga', labelPlural: 'Pagas', icon: CircleCheck, tone: 'positive' },
  { value: 'partial', label: 'Parcial', labelPlural: 'Parciais', icon: CircleMinus, tone: 'neutral' },
  { value: 'open', label: 'Em aberto', labelPlural: 'Em aberto', icon: Clock, tone: 'muted' },
  { value: 'overdue', label: 'Em atraso', labelPlural: 'Em atraso', icon: TriangleAlert, tone: 'negative' },
]

/**
 * Uma cobrança: o que alguém te deve, com que frequência e até quando.
 *
 * Não é lançamento — é expectativa. Quem diz se foi paga é o extrato: o ingest casa as
 * entradas da contraparte naquela conta e escreve `receivableId` nelas. O valor declarado é
 * REFERÊNCIA, não igualdade: o rateio de uma despesa varia mês a mês, e casar por valor
 * confundiria dois recebimentos de mesmo número vindos de origens diferentes.
 *
 * `offsetsCategoryId` é o que torna a cobrança contábil e não só um lembrete: o valor
 * recebido abate aquela categoria de despesa, porque a parte reembolsada nunca foi custo seu.
 */
export interface Receivable {
  id: string
  /** Quem deve, como aparece na tela. */
  debtor: string
  label: string
  /** Quanto se espera por ocorrência. Referência para a diferença, não critério de casamento. */
  amount: number
  dueOn: PlannedDueDate
  recurrence: Recurrence
  startMonth: string
  /** Último mês em que a cobrança vale. Ausente significa sem prazo. */
  endMonth?: string
  /** Só para `installments`: quantas ocorrências. */
  count?: number
  /** Como reconhecer a entrada que quita esta cobrança. */
  match: MatchRule
  /** A categoria de despesa que o recebimento abate. */
  offsetsCategoryId: string
}

/**
 * Uma rubrica de gasto: quanto se espera gastar por mês naquela categoria.
 *
 * O número tem DUAS leituras, e é de propósito que seja um só. No mês em curso é **teto** —
 * a tela avisa ao se aproximar. Nos meses futuros é **previsão** — entra na projeção como
 * saída. Dois números separados divergiriam no primeiro ajuste de um deles.
 *
 * A projeção é um PISO, não uma soma: se a categoria já tem parcela contratada ou conta
 * declarada naquele mês, a rubrica projeta só a diferença. Somar contaria o mesmo gasto duas
 * vezes — a parcela do Airbnb já é viagem, e a rubrica de viagem não a acrescenta.
 */
export interface BudgetCategory {
  categoryId: string
  amount: number
}

export interface Budget {
  /** Teto de saídas de um mês, no recorte consolidado. */
  monthlyLimit: number
  /** Fração do teto a partir da qual a tela avisa. */
  warnAt: number
  /** Rubricas: o gasto esperado por categoria. Vazio significa só o teto global. */
  byCategory?: BudgetCategory[]
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

/**
 * Onde a ocorrência cai DENTRO do mês.
 *
 * Existe por duas razões, e a segunda é a que paga o custo do campo. A primeira é a tela:
 * "todo dia 25" diz mais que "todo mês". A segunda é o mês em curso — sem dia não dá para
 * saber se a ocorrência já aconteceu, e por isso o mês com extrato não podia receber regra
 * nenhuma. Com dia, dá: conta o que vence DEPOIS da última data com dado.
 *
 * `business-day` é o 5º dia útil e afins, resolvido pelo calendário bancário
 * (`src/lib/business-days.ts`); `day` é dia fixo, encaixado no último dia quando o mês é
 * curto. Ausente significa "em algum momento do mês" — a leitura de antes deste campo.
 */
export type PlannedDueDate = { kind: 'day'; day: number } | { kind: 'business-day'; nth: number }

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
  /** Dia da ocorrência dentro do mês. Ausente = mês inteiro, sem data. */
  dueOn?: PlannedDueDate
  /** Só para `installments`: quantas ocorrências. */
  count?: number
  /** Só para `monthly`: último mês. Ausente significa sem prazo. */
  endMonth?: string
  /**
   * Mês → valor que substitui o padrão. Resolve "todo mês é X, menos em tal mês"
   * sem precisar de duas regras concorrentes.
   */
  exceptions?: Record<string, number>
  /**
   * Como reconhecer o lançamento que cumpre esta regra. **Opcional, e é ele que separa as
   * duas naturezas de uma declaração.**
   *
   * COM `match`, a regra é uma conta a pagar (ou um recebimento) com credor conhecido: dá
   * para dizer "paguei?", "atrasou?". SEM ele, é só projeção — o valor entra nos meses
   * futuros e ninguém pergunta se aconteceu, que é o certo para um gasto sem credor único.
   */
  match?: MatchRule
}
