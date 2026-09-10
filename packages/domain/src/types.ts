import {
  ArrowDownLeft,
  ArrowUUpLeft,
  ArrowUpRight,
  ArrowsLeftRight,
  Bank,
  Buildings,
  CheckCircle,
  Clock,
  CreditCard,
  LinkBreak,
  MinusCircle,
  Money,
  TrendUp,
  User,
  Warning,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

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
  icon?: PhosphorIcon
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
  { value: 'transfer', label: 'Transferência', labelPlural: 'Transferências', icon: ArrowsLeftRight, tone: 'muted' },
  { value: 'reimbursement', label: 'Reembolso', labelPlural: 'Reembolsos', icon: ArrowUUpLeft, tone: 'muted' },
]

export type Entity = 'PF' | 'PJ'

/**
 * O `label` é o termo por extenso e o `shortLabel` é a sigla, e os dois têm consumidor próprio:
 * o `label` desenha os toggles de recorte do cabeçalho, onde há espaço e o par precisa ser
 * simétrico — "Pessoa física" contra "Empresa" comparava uma pessoa com uma organização, sendo
 * que o eixo é a natureza jurídica dos dois lados. O `shortLabel` desenha o badge de conta, que
 * se repete em toda linha da tabela de transações e não comportaria o termo inteiro.
 */
export const entityKinds: EnumOption<Entity>[] = [
  { value: 'PF', label: 'Pessoa física', shortLabel: 'PF', icon: User, tone: 'neutral' },
  { value: 'PJ', label: 'Pessoa jurídica', shortLabel: 'PJ', icon: Buildings, tone: 'neutral' },
]

export type AccountType = 'checking' | 'credit-card' | 'investment'

export const accountsTypes: EnumOption<AccountType>[] = [
  { value: 'checking', label: 'Conta corrente', icon: Bank, tone: 'neutral' },
  { value: 'credit-card', label: 'Cartão de crédito', icon: CreditCard, tone: 'neutral' },
  { value: 'investment', label: 'Conta investimento', icon: TrendUp, tone: 'neutral' },
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
  { value: 'internal', label: 'Entre contas', icon: ArrowsLeftRight, tone: 'neutral' },
  { value: 'card-payment', label: 'Pagamento de fatura', icon: CreditCard, tone: 'neutral' },
  { value: 'investment', label: 'Investimento', icon: TrendUp, tone: 'neutral' },
  { value: 'unmatched-self', label: 'Sem contraparte', icon: LinkBreak, tone: 'muted' },
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

/** Uma posição da carteira na data do relatório da B3. */
export interface InvestmentHolding {
  code: string
  kind: 'fixed-income' | 'equity'
  label: string
  quantity: number
  value: number
}

export interface InvestmentSnapshot {
  /** Data do relatório de posição — não é "hoje", é quando você exportou. */
  asOf: string
  source: string
  holdings: InvestmentHolding[]
  /** Só os papéis. O patrimônio é este mais o `cash`. */
  total: number
  /**
   * Dinheiro parado no caixa da corretora — não é papel, e o relatório da B3 não o vê.
   * Vem do extrato da própria corretora (`scripts/brokerage.ts`).
   */
  cash: number
  /**
   * Ações entram na SÉRIE a custo, não a mercado: preço histórico exige uma fonte com
   * cadastro. O `total` acima é a mercado, porque vem da própria posição da B3.
   */
  equityAtCost: boolean
}

/**
 * Um mês da evolução patrimonial.
 *
 * `contributed` é o aporte LÍQUIDO acumulado — o que entrou na corretora vindo do seu banco
 * menos o que voltou para ele, pelo extrato da corretora. O resto é valor: renda fixa
 * acumulada pelo CDI de cada título, ações a custo, e o caixa parado. A distância entre um e
 * outro é o rendimento.
 *
 * O aporte NÃO sai do extrato bancário. Sairia errado: parte do resgate volta descrita como
 * TED do próprio titular, que nenhuma regra sobre "conta investimento" reconhece — e o que
 * não é reconhecido como resgate segue contado como dinheiro ainda aplicado.
 */
export interface PatrimonyPoint {
  month: string
  contributed: number
  fixedIncome: number
  equity: number
  cash: number
  total: number
  /**
   * O que os MESMOS aportes valeriam rendendo 100% do CDI. É a régua de comparação: uma
   * carteira quase toda em CDB pós-fixado não se mede contra o Ibovespa, se mede contra o
   * custo de oportunidade de ter deixado o dinheiro rendendo o básico.
   */
  benchmark: number
}

/**
 * Os proventos de um mês, separados pelas três naturezas que a corretora distingue.
 *
 * São coisas com tributação diferente, e é por isso que valem separadas: dividendo é isento
 * na pessoa física, JCP tem 15% retido na fonte, e rendimento de renda fixa segue a tabela
 * regressiva. Somá-los num número só esconde qual parte da renda é líquida.
 */
export interface IncomeMonth {
  month: string
  dividends: number
  jcp: number
  yields: number
  total: number
}

/**
 * Em que pé está uma intenção de compra.
 *
 * O estado é o que separa um PLANO de tudo o mais que este app projeta: uma conta tem credor,
 * uma rubrica tem histórico, uma parcela é fato consumado — um plano é uma decisão que ainda
 * pode não acontecer. `discarded` existe para você não jogar fora a pesquisa de preço ao mudar
 * de ideia, e para poder mudar de volta.
 */
export type PlanStatus = 'considering' | 'decided' | 'discarded'

export const planStatuses: EnumOption<PlanStatus>[] = [
  { value: 'considering', label: 'Em estudo', icon: Clock, tone: 'neutral' },
  { value: 'decided', label: 'Decidido', icon: CheckCircle, tone: 'positive' },
  { value: 'discarded', label: 'Descartado', icon: MinusCircle, tone: 'muted' },
]

/**
 * Como você vai pagar. É a escolha que a previsão usa.
 *
 * As DUAS formas ficam guardadas mesmo quando só uma está escolhida: é a diferença entre elas
 * que responde "quanto eu economizo à vista", e apagar a não escolhida jogaria fora a pesquisa
 * de preço que você já fez.
 */
export type PaymentMode = 'cash' | 'financed'

export const paymentModes: EnumOption<PaymentMode>[] = [
  { value: 'cash', label: 'À vista', icon: Money, tone: 'positive' },
  { value: 'financed', label: 'Parcelado', icon: CreditCard, tone: 'neutral' },
]

/**
 * Uma intenção de compra, com o mês em que você pretende fazê-la e as formas de pagar.
 *
 * `categoryId` liga o plano à MESMA taxonomia do resto do app, e não é enfeite: é o que
 * permite ao plano levantar o piso da rubrica daquela categoria em vez de se somar a ela.
 *
 * O parcelamento é o que torna a simulação interessante — uma compra grande quase sempre é
 * parcelada, e é o parcelamento que espalha o impacto pelos meses.
 */
export interface Plan {
  id: string
  label: string
  categoryId: string
  /** Preço à vista, em geral com desconto. Sempre presente: é o preço de referência. */
  cash: number
  /**
   * Preço TOTAL parcelado e em quantas vezes. Ausente quando a loja não parcela — ou quando
   * você ainda não pesquisou.
   */
  financed?: { total: number; installments: number }
  /**
   * Qual forma está escolhida. Só ela entra na previsão.
   *
   * AUSENTE é um estado legítimo — "ainda não decidi como pago" —, e não o mesmo que à vista:
   * um plano recém-anotado não tomou essa decisão, e nascer marcado como à vista afirmaria por
   * ele. Quando falta, o cálculo usa o preço à vista, que é o único que sempre existe.
   */
  payment?: PaymentMode
  status: PlanStatus
  /**
   * Mês da compra (AAAA-MM). Parcelado, é o mês da primeira parcela.
   *
   * AUSENTE é um desejo sem data, e um desejo sem data não entra na previsão: não há mês em
   * que ele pese. É por isso que `planMonths` devolve lista VAZIA em vez de chutar o mês que
   * vem — o chute apareceria no gráfico como compromisso, que é o que ele não é.
   */
  month?: string
  groupId?: string
  note?: string
}

/**
 * Um agrupamento de planos — uma viagem, uma reforma.
 *
 * A janela é RÓTULO, não regra: quem decide em que mês cada custo cai é o próprio plano. Um
 * grupo que espalhasse os itens sozinho teria de inventar a distribuição, e passagem, diária
 * e alimentação não caem no mesmo mês nem na mesma proporção.
 */
export interface PlanGroup {
  id: string
  label: string
  from?: string
  to?: string
  note?: string
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
  { value: 'settled', label: 'Recebida', labelPlural: 'Recebidas', icon: CheckCircle, tone: 'positive' },
  { value: 'partial', label: 'Parcial', labelPlural: 'Parciais', icon: MinusCircle, tone: 'neutral' },
  { value: 'open', label: 'Em aberto', labelPlural: 'Em aberto', icon: Clock, tone: 'muted' },
  { value: 'overdue', label: 'Em atraso', labelPlural: 'Em atraso', icon: Warning, tone: 'negative' },
]

export const payableStatuses: EnumOption<SettlementStatus>[] = [
  { value: 'settled', label: 'Paga', labelPlural: 'Pagas', icon: CheckCircle, tone: 'positive' },
  { value: 'partial', label: 'Parcial', labelPlural: 'Parciais', icon: MinusCircle, tone: 'neutral' },
  { value: 'open', label: 'Em aberto', labelPlural: 'Em aberto', icon: Clock, tone: 'muted' },
  { value: 'overdue', label: 'Em atraso', labelPlural: 'Em atraso', icon: Warning, tone: 'negative' },
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
/**
 * Um item da composição de uma rubrica: o que é, quanto por mês e a quanto a unidade.
 *
 * Existe para a rubrica guardar DE ONDE o número saiu. Sem isso, "R$ 1.200 de dieta" é um
 * total sem memória: três meses depois ninguém sabe se ele veio de 4 kg de whey ou de outra
 * coisa, e quando o preço de um item sobe não há como saber quanto mexer no total.
 *
 * `quantity` é fracionário de propósito — meio quilo de suplemento por mês é uma quantidade
 * legítima, e arredondá-la para 1 mentiria sobre o consumo.
 */
/**
 * Com que frequência o item é consumido. Ausente significa MENSAL.
 *
 * A ausência é o padrão de propósito: todo item escrito antes desta opção existir descrevia um
 * consumo mensal, e lê-lo como mensal preserva o valor dele sem migração nenhuma — a mesma
 * razão pela qual tornar mês e forma de pagamento opcionais num plano não pediu uma versão
 * nova do envelope. Migração cuja regra é a identidade só acrescenta um ramo que apodrece.
 */
export type BudgetCadence = 'day' | 'week' | 'month'

/**
 * As cadências como a pessoa as lê — declaradas AQUI, ao lado do tipo, e não na tela que as
 * desenha primeiro. É a §1 da `enum-display`: com o rótulo montado no JSX, acrescentar um
 * valor ao tipo não quebraria nada e a segunda tela a exibi-lo escreveria outra grafia.
 *
 * O rótulo é a forma CURTA ("/semana"), porque ele vive dentro da linha de um item, ao lado de
 * quantidade, unidade e preço — "por semana" gastaria o dobro da largura para dizer o mesmo.
 * A forma longa fica em `labelPlural`, para quem precisar dela numa legenda.
 */
export const budgetCadences: EnumOption<BudgetCadence>[] = [
  { value: 'day', label: '/dia', labelPlural: 'Todo dia', tone: 'neutral' },
  { value: 'week', label: '/semana', labelPlural: 'Toda semana', tone: 'neutral' },
  { value: 'month', label: '/mês', labelPlural: 'Todo mês', tone: 'neutral' },
]

export interface BudgetItem {
  label: string
  quantity: number
  /** Preço de UMA unidade — de um quilo, de um pote, de uma dose. */
  unitAmount: number
  /**
   * A unidade da quantidade: `kg`, `un`, `L`, `dose`, o que descrever a compra.
   *
   * É TEXTO LIVRE e não uma lista fechada. Uma lista teria de adivinhar de antemão tudo o que
   * cabe numa dieta — grama, dose, sachê, bandeja — e a primeira ausência obrigaria a pessoa a
   * mentir sobre o que compra. Ela não entra em conta nenhuma: é rótulo, e serve para o número
   * continuar legível daqui a três meses.
   */
  unit?: string
  cadence?: BudgetCadence
}

export interface BudgetCategory {
  categoryId: string
  /**
   * O valor da rubrica QUANDO NÃO HÁ composição.
   *
   * Com `items` preenchido, quem manda é a soma deles e este campo não é lido — ver
   * `rubricAmount`, em `src/lib/rubric.ts`. Guardar os dois e ler ora um ora outro é como
   * duas somas paralelas para o mesmo mês divergirem, que é o erro que este projeto já
   * cometeu uma vez; aqui só um dos dois é a verdade, e é sempre o mesmo.
   */
  amount: number
  /** A composição, quando você quer que o número seja conferível em vez de decorado. */
  items?: BudgetItem[]
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
