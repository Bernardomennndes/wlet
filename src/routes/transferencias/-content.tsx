import { ArrowRight, MagnifyingGlassMinus } from '@phosphor-icons/react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useMemo } from 'react'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { StatusBadge } from '@/components/status-badge'
import { TransferKindBadge } from '@/components/transfer-kind-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Transfer } from '@/data/types'
import { ACCOUNT_MAP, accountInScope, sum, TRANSACTIONS, TRANSFERS } from '@/lib/finance'
import { formatBRL, formatDate } from '@/lib/format'
import { useFilters } from '@/providers/use-filters'
import { AccountChip } from './-components/account-chip'

export function TransferenciasPageContent() {
  useDocumentTitle('Transferências')
  const { period, scope } = useFilters()

  const rows = useMemo(
    () =>
      TRANSFERS.filter((t) => {
        const m = t.date.slice(0, 7)
        if (m < period.from || m > period.to) return false
        return accountInScope(t.fromAccountId, scope) || accountInScope(t.toAccountId, scope)
      }).sort((a, b) => b.date.localeCompare(a.date)),
    [period, scope],
  )

  const pairs = useMemo(() => {
    const map = new Map<string, { from: string; to: string; kind: Transfer['kind']; total: number; count: number }>()
    for (const t of rows) {
      const key = `${t.fromAccountId}→${t.toAccountId}|${t.kind}`
      const row = map.get(key) ?? { from: t.fromAccountId, to: t.toAccountId, kind: t.kind, total: 0, count: 0 }
      row.total += t.amount
      row.count += 1
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [rows])

  const unmatched = useMemo(
    () =>
      TRANSACTIONS.filter((t) => {
        const m = t.date.slice(0, 7)
        return t.transferKind === 'unmatched-self' && m >= period.from && m <= period.to && accountInScope(t.accountId, scope)
      }),
    [period, scope],
  )

  const pjToPf = sum(rows.filter((t) => ACCOUNT_MAP[t.fromAccountId]?.entity === 'PJ' && ACCOUNT_MAP[t.toAccountId]?.entity === 'PF').map((t) => t.amount))

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-2">
        <Breadcrumbs />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Transferências entre contas</h1>
            <p className="text-xs text-muted-foreground">
              Pares detectados por valor idêntico, datas próximas e descrição apontando para você mesmo. Retiradas da empresa para a pessoa física no período:{' '}
              <strong className="text-foreground">{formatBRL(pjToPf)}</strong>.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Fluxos entre contas</CardTitle>
          <CardDescription>Soma por origem, destino e tipo</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Lista vazia não renderiza `<ul>`: sem cabeçalho, uma lista sem itens não explica nada. */}
          {pairs.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MagnifyingGlassMinus />
                </EmptyMedia>
                <EmptyTitle>Nenhum fluxo entre contas no período e recorte selecionados.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataList aria-label="Fluxos entre contas">
              {pairs.map((p) => (
                <DataListItem key={`${p.from}${p.to}${p.kind}`}>
                  <DataListItemHeader>
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <AccountChip id={p.from} />
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <AccountChip id={p.to} />
                    </span>
                  </DataListItemHeader>
                  <DataListItemFields>
                    <DataListField label="Total" separator={false}>
                      {formatBRL(p.total)}
                    </DataListField>
                    <DataListField label="Transferências">{p.count}</DataListField>
                    <DataListField label="Tipo">
                      <TransferKindBadge value={p.kind} />
                    </DataListField>
                  </DataListItemFields>
                </DataListItem>
              ))}
            </DataList>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todas as transferências</CardTitle>
          <CardDescription>{rows.length} no período</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {/* Estado vazio DENTRO da tabela: o cabeçalho é o que explica o que a listagem contém. */}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MagnifyingGlassMinus />
                        </EmptyMedia>
                        <EmptyTitle>Nenhuma transferência no período e recorte selecionados.</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                    <TableCell>
                      <AccountChip id={t.fromAccountId} />
                    </TableCell>
                    <TableCell>
                      <AccountChip id={t.toAccountId} />
                    </TableCell>
                    <TableCell>
                      <TransferKindBadge value={t.kind} />
                      {!t.fromTransactionId || !t.toTransactionId ? <StatusBadge status="sem-contraparte" className="ml-1" /> : null}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{t.description}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(t.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {unmatched.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Movimentações próprias sem contraparte</CardTitle>
            <CardDescription>Parecem transferências para você mesmo, mas o outro lado não está em nenhum arquivo. Não entram como receita nem despesa; confira se falta algum extrato.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataList aria-label="Movimentações próprias sem contraparte">
              {unmatched.map((t) => (
                <DataListItem key={t.id}>
                  <DataListItemHeader>
                    <AccountChip id={t.accountId} />
                    <span className="shrink-0 font-normal text-muted-foreground tabular-nums">{formatDate(t.date)}</span>
                  </DataListItemHeader>
                  <span className="text-muted-foreground">{t.description}</span>
                  <DataListItemFields>
                    <DataListField label="Valor" separator={false}>
                      {formatBRL(t.amount)}
                    </DataListField>
                  </DataListItemFields>
                </DataListItem>
              ))}
            </DataList>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
