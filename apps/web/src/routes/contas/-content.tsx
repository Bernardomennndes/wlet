import { useMemo } from 'react'
import { FileX, MagnifyingGlassMinus } from '@phosphor-icons/react'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { Link } from 'react-router'
import { AccountTypeBadge } from '@/components/account-type-badge'
import { EntityBadge } from '@/components/entity-badge'
import { SecondaryKpiGrid } from '@/components/kpi'
import { NotInformed } from '@/components/not-informed'
import { StatusBadge } from '@/components/status-badge'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wlet/ui/components/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@wlet/ui/components/tooltip'
import { ACCOUNTS, META, TRANSACTIONS, accountInScope, sum } from '@/lib/finance'
import { formatBRL, formatDate, formatMonthShort } from '@wlet/lib/format'
import { useFilters } from '@/providers/use-filters'
import { CONTAS_METRICS } from './-metric-definitions'

export function ContasPageContent() {
  useDocumentTitle('Contas')
  const { transactions, months, scope } = useFilters()

  const cards = useMemo(
    () =>
      ACCOUNTS.filter((a) => accountInScope(a.id, scope)).map((account) => {
        const own = transactions.filter((t) => t.accountId === account.id)
        const inflow = sum(own.filter((t) => t.amount > 0).map((t) => t.amount))
        const outflow = sum(own.filter((t) => t.amount < 0).map((t) => -t.amount))
        const invested = account.type === 'investment' ? sum(TRANSACTIONS.filter((t) => t.counterpartAccountId === account.id).map((t) => -t.amount)) : null
        return { account, own, inflow, outflow, invested }
      }),
    [transactions, scope],
  )

  // A tabela mensal só tem linha para quem tem extrato próprio: a conta de investimento é virtual,
  // não recebe lançamento nenhum. Extraído do JSX porque o vazio da tabela precisa contar as linhas
  // antes de renderizá-las.
  const monthlyRows = useMemo(() => cards.filter((c) => c.account.type !== 'investment'), [cards])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Contas</h1>
            <p className="text-xs text-muted-foreground">Identificadas pelos metadados dos próprios arquivos.</p>
          </div>
        </div>
      </header>

      {/* Lista, não grade de cartões: são seis contas fixas, os campos são heterogêneos
          (badges, dois KPIs, uma ação) e ninguém ordena coluna nenhuma aqui. Itens colados
          num bloco só — cartão por item daria bordas concorrentes e nenhum `<ul>` para o
          leitor de tela anunciar.
          Lista vazia não renderiza `<ul>`: sem cabeçalho, uma lista sem itens não explica nada. O
          vazio aqui é o do RECORTE (PF/PJ), não o do cadastro — as contas vêm dos metadados dos
          arquivos e não somem; o que some é o que o recorte deixa passar. */}
      {cards.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MagnifyingGlassMinus />
            </EmptyMedia>
            <EmptyTitle>Nenhuma conta no recorte selecionado.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataList aria-label="Contas">
          {cards.map(({ account, own, inflow, outflow, invested }) => (
            <DataListItem key={account.id} className="gap-2.5">
              <DataListItemHeader>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{account.name}</span>
                  <AccountTypeBadge value={account.type} />
                  <EntityBadge entity={account.entity} />
                </span>
                {/* Conta virtual: não tem lançamentos próprios e nem aparece no filtro de contas. */}
                {account.type === 'investment' ? null : (
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="outline" size="sm" render={<Link to={`/transacoes?conta=${account.id}`} aria-label={`Ver lançamentos de ${account.name}`} />} />}>
                      Ver lançamentos
                    </TooltipTrigger>
                    <TooltipContent>Abre a lista de transações já filtrada por esta conta</TooltipContent>
                  </Tooltip>
                )}
              </DataListItemHeader>

              <p className="text-muted-foreground">
                {account.bank}
                {account.externalId ? ` · ${account.externalId}` : ''} · {account.holder}
              </p>

              {account.type === 'investment' ? (
                <SecondaryKpiGrid
                  columns={1}
                  items={[
                    {
                      key: 'invested',
                      label: 'Saldo líquido aportado (todo o histórico)',
                      definition: CONTAS_METRICS.investedBalance,
                      value: invested === null ? null : formatBRL(invested),
                      hint: 'Conta virtual: só aparece como destino dos aportes feitos pela XP Conta. Sem extrato próprio.',
                    },
                  ]}
                />
              ) : (
                <>
                  <SecondaryKpiGrid
                    columns={2}
                    items={[
                      { key: 'inflow', label: account.type === 'credit-card' ? 'Pagamentos recebidos' : 'Entradas brutas', definition: CONTAS_METRICS.grossInflow, value: formatBRL(inflow) },
                      { key: 'outflow', label: account.type === 'credit-card' ? 'Compras e encargos' : 'Saídas brutas', definition: CONTAS_METRICS.grossOutflow, value: formatBRL(outflow) },
                    ]}
                  />
                  <DataListItemFields>
                    <DataListField label="Cobertura" separator={false}>
                      {account.coverage ? `${formatDate(account.coverage.from)} a ${formatDate(account.coverage.to)}` : <NotInformed />}
                    </DataListField>
                    <DataListField label="Lançamentos">
                      {own.length} no período · {account.transactionCount} no total
                    </DataListField>
                    {account.reportedBalance ? (
                      <DataListField label="Saldo informado">
                        {formatBRL(account.reportedBalance.amount)} em {formatDate(account.reportedBalance.asOf)}
                      </DataListField>
                    ) : null}
                    <DataListField label="Arquivos">{account.sources.length}</DataListField>
                  </DataListItemFields>
                </>
              )}
            </DataListItem>
          ))}
        </DataList>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Movimento mensal por conta</CardTitle>
          <CardDescription>Entradas e saídas brutas de cada conta, incluindo transferências.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                {months.map((m) => (
                  <TableHead key={m} className="text-right">
                    {formatMonthShort(m)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {/* Estado vazio DENTRO da tabela: o cabeçalho é o que explica o que a listagem contém.
                  O `colSpan` acompanha o cabeçalho: a coluna "Conta" mais uma por mês do período. */}
              {monthlyRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={1 + months.length}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <MagnifyingGlassMinus />
                        </EmptyMedia>
                        <EmptyTitle>Nenhuma conta com extrato próprio no recorte selecionado.</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                monthlyRows.map(({ account, own }) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    {months.map((m) => {
                      const inM = sum(own.filter((t) => t.month === m && t.amount > 0).map((t) => t.amount))
                      const outM = sum(own.filter((t) => t.month === m && t.amount < 0).map((t) => -t.amount))
                      return (
                        <TableCell key={m} className="text-right">
                          {inM ? <div className="text-[var(--status-good-text)]">{formatBRL(inM)}</div> : null}
                          {outM ? <div className="text-muted-foreground">{formatBRL(outM)}</div> : null}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Arquivos processados</CardTitle>
          <CardDescription>
            Gerado em {new Date(META.generatedAt).toLocaleString('pt-BR')} · {META.totals.transactions} transações · {META.totals.transfers} transferências
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead className="text-right">Transações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Estado vazio DENTRO da tabela: o cabeçalho é o que explica o que a listagem contém.
                  Aqui não há filtro — se a lista está vazia, nenhum arquivo foi lido no processamento. */}
              {META.sourceFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileX />
                        </EmptyMedia>
                        <EmptyTitle>Nenhum arquivo processado.</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                META.sourceFiles.map((f) => (
                  <TableRow key={f.path}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{f.path.replace('docs/', '')}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.skippedAsDuplicate ? <StatusBadge status="duplicado" /> : f.transactions}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
