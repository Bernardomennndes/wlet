import { useMemo } from 'react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { CalendarClock } from 'lucide-react'
import { CategoryBadge } from '@/components/category-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { EntityBadge } from '@/components/entity-badge'
import { FlowBadge } from '@/components/flow-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { plannedRecurrences, type PlannedEntry } from '@/data/types'
import { lastMonthWithData, monthsBetween, shiftMonth } from '@/lib/finance'
import { formatBRL, formatMonthLongLabel, formatMonthShort, plural } from '@/lib/format'
import { PLANNED, amountAt, lastOccurrence, occursIn } from '@/lib/planned'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const RECURRENCE_OPTIONS = new Map(plannedRecurrences.map((option) => [option.value, option]))

/**
 * A frase de "quando" sai de um switch exaustivo: recorrência que o tipo não conhece cai no
 * rótulo da lista, e na falta dele no valor cru — em vez de se disfarçar de mensal.
 */
function describeWhen(entry: PlannedEntry): string {
  const end = lastOccurrence(entry)
  const until = end ? ` · até ${formatMonthShort(end)}` : ''
  switch (entry.recurrence) {
    case 'monthly':
      return `Todo mês a partir de ${formatMonthShort(entry.startMonth)}${until}`
    case 'once':
      return `Uma vez em ${formatMonthShort(entry.startMonth)}`
    case 'installments': {
      const count = Math.max(1, entry.count ?? 1)
      return `${count} ${plural(count, 'parcela', 'parcelas')} de ${formatMonthShort(entry.startMonth)}${until}`
    }
    default:
      return `${RECURRENCE_OPTIONS.get(entry.recurrence)?.label ?? entry.recurrence} a partir de ${formatMonthShort(entry.startMonth)}${until}`
  }
}

export function PrevisaoPageContent() {
  useDocumentTitle('Previsão')
  // A janela da prévia sai das próprias regras, não do filtro do cabeçalho: começa no mês
  // seguinte ao último com lançamentos e vai até a última ocorrência conhecida. Mínimo de
  // 12 meses para dar contexto, máximo de 24 para não virar tabela infinita quando houver
  // regra sem prazo.
  const futureMonths = useMemo(() => {
    const start = shiftMonth(lastMonthWithData(), 1)
    const finite = PLANNED.map(lastOccurrence)
      .filter((m): m is string => m !== null)
      .sort()
    const last = finite.length ? finite[finite.length - 1] : start
    const min = shiftMonth(start, 11)
    const max = shiftMonth(start, 23)
    return monthsBetween(start, last > min ? (last > max ? max : last) : min)
  }, [])

  const preview = useMemo(
    () =>
      futureMonths.map((month) => {
        let income = 0
        let expense = 0
        for (const entry of PLANNED) {
          if (!occursIn(entry, month)) continue
          if (entry.kind === 'income') income += amountAt(entry, month)
          else expense += amountAt(entry, month)
        }
        return { month, income, expense, net: income - expense }
      }),
    [futureMonths],
  )

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-2">
        <Breadcrumbs />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Previsão</h1>
            <p className="text-xs text-muted-foreground">
              O que está declarado aqui é o que os gráficos mostram nos meses sem lançamentos. Nada é extrapolado do histórico. Parcelas de cartão já compradas entram sozinhas na previsão de saída e
              não precisam ser cadastradas.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos previstos</CardTitle>
          <CardDescription>
            Configuração versionada em <code className="font-mono">scripts/planned.config.ts</code>, como as contas e as regras de categoria. Depois de editar, rode{' '}
            <code className="font-mono">pnpm ingest</code>. Edição pela interface fica para depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {PLANNED.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock />
                </EmptyMedia>
                <EmptyTitle>Nenhum lançamento previsto</EmptyTitle>
                <EmptyDescription>Enquanto não houver regras, os meses futuros mostram só as parcelas de cartão já contratadas.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataList aria-label="Lançamentos previstos">
              {PLANNED.map((entry) => {
                const exceptions = Object.entries(entry.exceptions ?? {}).sort()
                return (
                  <DataListItem key={entry.id}>
                    <DataListItemHeader className="justify-start gap-1.5">
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <EntityBadge entity={entry.entity} />
                      <FlowBadge value={entry.kind} />
                    </DataListItemHeader>
                    <DataListItemFields>
                      <DataListField label="Valor" separator={false}>
                        {formatBRL(entry.amount)}
                      </DataListField>
                      <DataListField label="Categoria">
                        <CategoryBadge value={entry.categoryId} />
                      </DataListField>
                      <DataListField label="Quando">{describeWhen(entry)}</DataListField>
                      {exceptions.length === 0 ? null : (
                        <DataListField label="Exceções">{exceptions.map(([month, value]) => `${formatMonthShort(month)}: ${formatBRL(value)}`).join(' · ')}</DataListField>
                      )}
                    </DataListItemFields>
                  </DataListItem>
                )
              })}
            </DataList>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>O que isso gera</CardTitle>
          <CardDescription>
            Só as regras acima, somando as duas entidades. As parcelas de cartão já contratadas entram além disso e aparecem nos gráficos. A janela vai até a última ocorrência conhecida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {preview.map((row) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{formatMonthLongLabel(row.month)}</TableCell>
                  <TableCell className="text-right">{formatBRL(row.income)}</TableCell>
                  <TableCell className="text-right">{formatBRL(row.expense)}</TableCell>
                  <TableCell className={row.net < 0 ? 'text-right text-[var(--status-critical)]' : 'text-right text-[var(--status-good-text)]'}>{formatBRL(row.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
