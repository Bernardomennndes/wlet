import { useMemo } from 'react'
import { HandCoins } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { NotInformed } from '@/components/not-informed'
import { ReceivableStatusBadge } from '@/components/receivable-status-badge'
import { SettlementHistory } from '@/components/settlement-history'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { ACCOUNT_MAP, accountInScope, lastDateWithData, lastMonthWithData, sum } from '@/lib/finance'
import { formatBRL, formatDate, formatDayMonth, formatMonthLongLabel, formatMonthShort, plural } from '@/lib/format'
import { RECEIVABLES, settle, type Settlement } from '@/lib/receivables'
import { useFilters } from '@/providers/use-filters'
import { COBRANCAS_METRICS } from './-metric-definitions'

/** Quantos meses de histórico cada cobrança mostra. */
const HISTORY_MONTHS = 12

export function CobrancasPageContent() {
  useDocumentTitle('Cobranças')
  const { history, monthsWithData, scope, period, transactions } = useFilters()

  const currentMonth = lastMonthWithData()
  const today = lastDateWithData()

  // A conta em que a cobrança cai decide se ela pertence ao recorte: na visão Empresa, o
  // rateio do aluguel da conta pessoal não é assunto — e mantê-lo ali, sem os lançamentos
  // que o quitam, o mostraria eternamente em atraso.
  // Sem conta declarada não dá para dizer que ela é de um recorte só, então ela aparece nos dois.
  const receivables = useMemo(() => RECEIVABLES.filter((receivable) => !receivable.match.accountId || accountInScope(receivable.match.accountId, scope)), [scope])

  /**
   * A conciliação roda sobre TODO o histórico, e só depois o período recorta o que se vê.
   *
   * A ordem importa: numa cobrança parcelada o dinheiro entra em agosto e quita setembro, e
   * conciliar já filtrado declararia setembro em aberto sempre que o filtro começasse depois
   * de agosto. Calcular inteiro e exibir recortado dá o filtro sem perder a conta — mas o
   * preço fica dito: um atraso de abril não aparece num período que começa em agosto.
   */
  const settled = useMemo(() => settle(history, monthsWithData, today), [history, monthsWithData, today])
  const inPeriod = useMemo(() => settled.filter((o) => o.month >= period.from && o.month <= period.to), [settled, period])

  const byReceivable = useMemo(() => {
    const map = new Map<string, Settlement[]>()
    for (const occurrence of inPeriod) {
      const list = map.get(occurrence.ruleId) ?? []
      list.push(occurrence)
      map.set(occurrence.ruleId, list)
    }
    return map
  }, [inPeriod])

  const openThisMonth = sum(inPeriod.filter((o) => o.month === currentMonth).map((o) => Math.max(0, o.expected - o.actual)))
  const overdue = inPeriod.filter((o) => o.status === 'overdue')
  const overdueTotal = sum(overdue.map((o) => o.expected))
  // O abatido segue o PERÍODO, e agora de verdade: ele lia `history`, o recorte inteiro, e
  // o comentário aqui já afirmava o contrário. É o número que fecha com o que saiu das
  // categorias na Visão geral, então tem de ler o mesmo conjunto que aquela tela lê.
  const offsetInPeriod = useMemo(() => sum(transactions.filter((tx) => tx.flow === 'reimbursement').map((tx) => Math.abs(tx.amount))), [transactions])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Cobranças</h1>
            <p className="text-xs text-muted-foreground">
              O que outras pessoas te devem. O dinheiro que volta não é receita: é o rateio de uma despesa que você adiantou, então ele abate a categoria de origem em vez de somar às entradas. Quem
              diz se foi paga é o extrato — não há marcar como recebida.
            </p>
          </div>
        </div>
      </header>

      <KpiCardGrid columns={3}>
        <KpiCard
          label="A receber no mês"
          definition={COBRANCAS_METRICS.openThisMonth}
          value={openThisMonth > 0 ? formatBRL(openThisMonth) : null}
          emptyLabel="Nada em aberto"
          hint={formatMonthLongLabel(currentMonth)}
        />
        <KpiCard
          label="Em atraso"
          definition={COBRANCAS_METRICS.overdue}
          value={overdue.length ? formatBRL(overdueTotal) : null}
          emptyLabel="Nada em atraso"
          tone={overdue.length ? 'risk' : 'default'}
          hint={
            overdue.length
              ? `${overdue.length} ${plural(overdue.length, 'mês', 'meses')} ${plural(overdue.length, 'vencido', 'vencidos')} sem recebimento`
              : `Vencimentos conferidos até ${formatDate(today)}`
          }
        />
        <KpiCard
          label="Abatido no período"
          definition={COBRANCAS_METRICS.offsetInPeriod}
          value={offsetInPeriod > 0 ? formatBRL(offsetInPeriod) : null}
          emptyLabel="Nada abatido"
          hint="Saiu das despesas, não entrou nas receitas"
        />
      </KpiCardGrid>

      <Card>
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
          <CardDescription>
            Configuração em <code className="font-mono">scripts/receivables.config.ts</code>, como as contas e as regras de categoria. Depois de editar, rode{' '}
            <code className="font-mono">pnpm ingest</code>. O casamento é por contraparte e conta, nunca por valor — o rateio varia mês a mês, e o valor declarado serve para mostrar a diferença.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HandCoins />
                </EmptyMedia>
                <EmptyTitle>Nenhuma cobrança cadastrada</EmptyTitle>
                <EmptyDescription>
                  Nenhuma cobrança cai numa conta deste recorte. Sem elas, toda entrada de pessoa conta como receita — inclusive o rateio de uma despesa que você adiantou.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataList aria-label="Cobranças">
              {receivables.map((receivable) => {
                const occurrences = byReceivable.get(receivable.id) ?? []
                const current = occurrences.find((o) => o.month === currentMonth)
                const account = receivable.match.accountId ? ACCOUNT_MAP[receivable.match.accountId] : null
                const received = sum(occurrences.map((o) => o.actual))
                // Uma parcelada tem fim conhecido e um total; uma mensal, não. Dizer "em diante"
                // numa dívida de seis parcelas esconderia justamente o que falta dela.
                const isPlan = receivable.recurrence !== 'monthly'
                const count = Math.max(1, receivable.count ?? 1)
                const last = occurrences.length ? occurrences[0].month : receivable.endMonth
                const window = isPlan
                  ? `${count} ${plural(count, 'parcela', 'parcelas')} de ${formatMonthShort(receivable.startMonth)}${last ? ` · até ${formatMonthShort(last)}` : ''}`
                  : `${formatMonthShort(receivable.startMonth)} ${receivable.endMonth ? `a ${formatMonthShort(receivable.endMonth)}` : 'em diante'}`
                const due = receivable.dueOn.kind === 'business-day' ? `${receivable.dueOn.nth}º dia útil` : `Dia ${receivable.dueOn.day}`

                return (
                  <DataListItem key={receivable.id} className="gap-2">
                    <DataListItemHeader className="justify-start gap-1.5">
                      <span className="min-w-0 truncate">{receivable.debtor}</span>
                      {/* A situação exibida é a do MÊS CORRENTE. Uma cobrança encerrada não
                          tem ocorrência nele, e aí não há situação a anunciar. */}
                      {current ? <ReceivableStatusBadge value={current.status} /> : null}
                    </DataListItemHeader>
                    <DataListItemFields>
                      <DataListField label="Cobrança" separator={false}>
                        {receivable.label}
                      </DataListField>
                      <DataListField label={isPlan ? 'Por parcela' : 'Esperado'}>{formatBRL(receivable.amount)}</DataListField>
                      <DataListField label="Vencimento">{due}</DataListField>
                      <DataListField label="Vigência">{window}</DataListField>
                      <DataListField label="Cai em">{account?.name ?? <NotInformed>Qualquer conta</NotInformed>}</DataListField>
                      <DataListField label="Abate">
                        <CategoryBadge value={receivable.offsetsCategoryId} />
                      </DataListField>
                    </DataListItemFields>
                    <DataListItemFields>
                      <DataListField label={`Situação em ${formatMonthShort(currentMonth)}`} separator={false}>
                        {current ? (
                          // `dueDate` é nulo quando a regra não declara dia; aí não há prazo a citar.
                          `${current.actual > 0 ? `${formatBRL(current.actual)} de ${formatBRL(current.expected)}` : 'Nada recebido'}${current.dueDate ? ` · vence em ${formatDayMonth(current.dueDate)}` : ''}`
                        ) : (
                          <NotInformed>Encerrada</NotInformed>
                        )}
                      </DataListField>
                      {/* Numa parcelada o denominador existe e é o que torna o progresso
                          legível: "1.351,77 de 2.703,54" diz quanto falta; o número sozinho, não. */}
                      <DataListField label="Recebido na vigência">{isPlan ? `${formatBRL(received)} de ${formatBRL(receivable.amount * count)}` : formatBRL(received)}</DataListField>
                    </DataListItemFields>
                    <SettlementHistory occurrences={occurrences.slice(0, HISTORY_MONTHS)} kind="receivable" counterpart={{ label: 'Pago por', ignore: receivable.debtor }} />
                  </DataListItem>
                )
              })}
            </DataList>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
