import { useMemo } from 'react'
import { Receipt } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { EntityBadge } from '@/components/entity-badge'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { NotInformed } from '@/components/not-informed'
import { PayableStatusBadge } from '@/components/payable-status-badge'
import { SettlementHistory } from '@/components/settlement-history'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { ACCOUNT_MAP, lastDateWithData, lastMonthWithData, sum } from '@/lib/finance'
import { formatBRL, formatDate, formatDayMonth, formatMonthLongLabel, formatMonthShort, plural } from '@wlet/lib/format'
import { CONCILIATED, settlePlanned } from '@/lib/planned'
import type { Settlement } from '@/lib/settlement'
import { useFilters } from '@/providers/use-filters'
import { PAGAMENTOS_METRICS } from './-metric-definitions'

/** Quantos meses de histórico cada conta mostra. */
const HISTORY_MONTHS = 12

export function PagamentosPageContent() {
  useDocumentTitle('Pagamentos')
  const { history, monthsWithData, scope, period } = useFilters()

  const currentMonth = lastMonthWithData()
  const today = lastDateWithData()

  // Só as SAÍDAS declaradas: um recebimento previsto é conciliado do mesmo jeito, mas ele
  // pertence à Previsão, não a esta tela. Aqui a pergunta é "o que ainda vou pagar".
  const payables = useMemo(() => CONCILIATED.filter((entry) => entry.kind === 'expense' && (scope === 'all' || entry.entity === scope)), [scope])

  /**
   * A conciliação roda sobre TODO o histórico, e só depois o período recorta o que se vê.
   *
   * A ordem importa: numa regra parcelada o dinheiro entra em agosto e quita setembro, então
   * conciliar já filtrado declararia setembro em aberto sempre que o filtro começasse depois
   * de agosto. Calcular inteiro e exibir recortado dá o filtro sem perder a conta.
   */
  const settled = useMemo(() => settlePlanned(history, monthsWithData, today, 'expense'), [history, monthsWithData, today])
  const inPeriod = useMemo(() => settled.filter((o) => o.month >= period.from && o.month <= period.to), [settled, period])
  const byRule = useMemo(() => {
    const map = new Map<string, Settlement[]>()
    for (const occurrence of inPeriod) {
      const list = map.get(occurrence.ruleId) ?? []
      list.push(occurrence)
      map.set(occurrence.ruleId, list)
    }
    return map
  }, [inPeriod])

  const visible = useMemo(() => new Set(payables.map((entry) => entry.id)), [payables])
  const inScope = useMemo(() => inPeriod.filter((occurrence) => visible.has(occurrence.ruleId)), [inPeriod, visible])

  const dueThisMonth = sum(inScope.filter((o) => o.month === currentMonth).map((o) => Math.max(0, o.expected - o.actual)))
  const overdue = inScope.filter((o) => o.status === 'overdue')
  const overdueTotal = sum(overdue.map((o) => o.expected))

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Pagamentos</h1>
            {/* As rubricas saíram para a tela própria: aqui só o que tem credor e vencimento,
                que é a pergunta desta tela. */}
            <p className="text-xs text-muted-foreground">Uma conta tem credor e vencimento, e quem responde se ela foi paga é o extrato.</p>
          </div>
        </div>
      </header>

      <KpiCardGrid columns={2}>
        <KpiCard
          label="A pagar no mês"
          definition={PAGAMENTOS_METRICS.dueThisMonth}
          value={dueThisMonth > 0 ? formatBRL(dueThisMonth) : null}
          emptyLabel="Nada em aberto"
          hint={formatMonthLongLabel(currentMonth)}
        />
        <KpiCard
          label="Em atraso"
          definition={PAGAMENTOS_METRICS.overdue}
          value={overdue.length ? formatBRL(overdueTotal) : null}
          emptyLabel="Nada em atraso"
          tone={overdue.length ? 'risk' : 'default'}
          hint={
            overdue.length
              ? `${overdue.length} ${plural(overdue.length, 'mês', 'meses')} ${plural(overdue.length, 'vencido', 'vencidos')} sem pagamento`
              : `Vencimentos conferidos até ${formatDate(today)}`
          }
        />
      </KpiCardGrid>

      <Card>
        <CardHeader>
          <CardTitle>Contas a pagar</CardTitle>
          <CardDescription>As declarações que informam credor. Só elas ganham situação de pagamento; as demais apenas projetam.</CardDescription>
        </CardHeader>
        <CardContent>
          {payables.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt />
                </EmptyMedia>
                <EmptyTitle>Nenhuma conta a pagar neste recorte</EmptyTitle>
                <EmptyDescription>Uma despesa prevista só vira conta quando declara como reconhecer o pagamento no extrato. Sem isso ela continua projetando, mas sem situação.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataList aria-label="Contas a pagar">
              {payables.map((entry) => {
                const occurrences = byRule.get(entry.id) ?? []
                const current = occurrences.find((o) => o.month === currentMonth)
                const account = entry.match?.accountId ? ACCOUNT_MAP[entry.match.accountId] : null
                const paid = sum(occurrences.map((o) => o.actual))
                const isPlan = entry.recurrence !== 'monthly'
                const count = Math.max(1, entry.count ?? 1)
                const last = occurrences.length ? occurrences[0].month : entry.endMonth
                const window = isPlan
                  ? `${count} ${plural(count, 'parcela', 'parcelas')} de ${formatMonthShort(entry.startMonth)}${last ? ` · até ${formatMonthShort(last)}` : ''}`
                  : `${formatMonthShort(entry.startMonth)} ${entry.endMonth ? `a ${formatMonthShort(entry.endMonth)}` : 'em diante'}`
                const due = entry.dueOn ? (entry.dueOn.kind === 'business-day' ? `${entry.dueOn.nth}º dia útil` : `Dia ${entry.dueOn.day}`) : null

                return (
                  <DataListItem key={entry.id} className="gap-2">
                    <DataListItemHeader className="justify-start gap-1.5">
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <EntityBadge entity={entry.entity} />
                      {current ? <PayableStatusBadge value={current.status} /> : null}
                    </DataListItemHeader>
                    <DataListItemFields>
                      <DataListField label={isPlan ? 'Por parcela' : 'Esperado'} separator={false}>
                        {formatBRL(entry.amount)}
                      </DataListField>
                      <DataListField label="Vencimento">{due ?? <NotInformed>Sem dia</NotInformed>}</DataListField>
                      <DataListField label="Vigência">{window}</DataListField>
                      <DataListField label="Sai de">{account?.name ?? <NotInformed>Qualquer conta</NotInformed>}</DataListField>
                      <DataListField label="Categoria">
                        <CategoryBadge value={entry.categoryId} />
                      </DataListField>
                    </DataListItemFields>
                    <DataListItemFields>
                      <DataListField label={`Situação em ${formatMonthShort(currentMonth)}`} separator={false}>
                        {current ? (
                          `${current.actual > 0 ? `${formatBRL(current.actual)} de ${formatBRL(current.expected)}` : 'Nada pago'}${current.dueDate ? ` · vence em ${formatDayMonth(current.dueDate)}` : ''}`
                        ) : (
                          <NotInformed>Encerrada</NotInformed>
                        )}
                      </DataListField>
                      <DataListField label="Pago na vigência">{isPlan ? `${formatBRL(paid)} de ${formatBRL(entry.amount * count)}` : formatBRL(paid)}</DataListField>
                    </DataListItemFields>
                    <SettlementHistory occurrences={occurrences.slice(0, HISTORY_MONTHS)} kind="payable" />
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
