import { useCallback, useMemo } from 'react'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { Link, useSearchParams } from 'react-router'
import { MagnifyingGlassMinus } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { CategoryBadge } from '@/components/category-badge'
import { CHART_TOKENS } from '@/components/charts/chart-theme'
import { TransactionTable } from '@/components/transaction-table'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { categoryColor } from '@/lib/chart-tokens'
import { CATEGORIES, CATEGORY_MAP, categoryGroupLabel, type Category } from '@/data/categories'
import { ACCOUNT_MAP, detectRecurring, lastMonthWithData, sum, summarizeByCategory, summarizeByMerchant } from '@/lib/finance'
import { buildCategoryForecast } from '@/lib/forecast'
import { plannedInScope } from '@/lib/planned'
import { receivablesInScope } from '@/lib/receivables'
import { formatAxis, formatBRL, formatDate, formatMonthLong, formatMonthLongLabel, formatMonthShort, formatPercent, plural } from '@/lib/format'
import { useFilters } from '@/providers/use-filters'
import { BarList, type BarListItem } from './-components/bar-list'
import { CategoryStackChart } from './-components/category-stack-chart'
import { VariabilityBadge } from './-components/variability-badge'

/** Estático: a legenda lista o catálogo, não o recorte. */
const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === 'expense')

export function CategoriasPageContent() {
  useDocumentTitle('Categorias')
  const { transactions, history, months, scope } = useFilters()
  const [params, setParams] = useSearchParams()
  const selected = params.get('categoria') ?? ''

  const expenseCats = useMemo(() => summarizeByCategory(transactions, 'expense'), [transactions])
  const incomeCats = useMemo(() => summarizeByCategory(transactions, 'income'), [transactions])
  const merchants = useMemo(() => summarizeByMerchant(transactions, 'expense'), [transactions])
  const recurring = useMemo(() => detectRecurring(merchants, months.length), [merchants, months.length])
  const totalExpense = sum(expenseCats.map((c) => c.total))
  const totalIncome = sum(incomeCats.map((c) => c.total))

  // Mesma previsão da visão geral, aberta por categoria: regras cadastradas mais
  // parcelas contratadas. Só `byMonth` é enriquecido:
  // `total`, `share` e `count` continuam sendo medição pura, e é deles que saem o
  // ranking, as recorrentes e os estabelecimentos.
  const projectedFrom = useMemo(() => months.find((m) => m > lastMonthWithData()), [months])
  const chartCategories = useMemo(() => {
    if (!projectedFrom) return expenseCats
    const forecast = buildCategoryForecast({
      history,
      planned: plannedInScope(scope),
      receivables: receivablesInScope(scope, (id) => ACCOUNT_MAP[id]?.entity),
      targets: months.filter((m) => m >= projectedFrom),
    })
    return expenseCats.map((c) => (forecast[c.categoryId] ? { ...c, byMonth: { ...c.byMonth, ...forecast[c.categoryId] } } : c))
  }, [expenseCats, history, scope, months, projectedFrom])

  // Reescreve só `categoria`, preservando recorte, período e tema na URL.
  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params)
      if (id) next.set('categoria', id)
      else next.delete('categoria')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  // Os itens da BarList saem prontos daqui: montá-los no JSX recriaria os arrays a cada render.
  const groups = useMemo(() => {
    const byGroup = new Map<Category['group'], typeof expenseCats>()
    for (const c of expenseCats) {
      const g = CATEGORY_MAP[c.categoryId]?.group ?? 'lifestyle'
      byGroup.set(g, [...(byGroup.get(g) ?? []), c])
    }
    return [...byGroup.entries()]
      .map(([group, cats]) => ({
        group,
        total: sum(cats.map((c) => c.total)),
        items: cats.map(
          (c): BarListItem => ({
            key: c.categoryId,
            label: c.label,
            value: c.total,
            share: c.share,
            color: categoryColor(c.categoryId),
            onClick: () => select(c.categoryId === selected ? '' : c.categoryId),
          }),
        ),
      }))
      .sort((a, b) => b.total - a.total)
  }, [expenseCats, selected, select])

  const detail = selected ? expenseCats.find((c) => c.categoryId === selected) : null
  // O reembolso entra na lista: ele é o que explica a diferença entre o valor cheio da
  // despesa e o total líquido da categoria. Fora dela, a soma da lista não fecharia com o topo.
  const detailRows = useMemo(() => transactions.filter((t) => (t.flow === 'expense' || t.flow === 'reimbursement') && t.displayCategoryId === selected), [transactions, selected])
  const detailMerchants = useMemo(() => summarizeByMerchant(detailRows, 'expense'), [detailRows])

  // Config do gráfico de detalhe: a cor vem do slot fixo da categoria, nunca do índice.
  const detailConfig = useMemo((): ChartConfig => {
    if (!detail) return {}
    return { value: { label: detail.label, color: categoryColor(detail.categoryId) } }
  }, [detail])

  const detailMonthly = useMemo(() => (detail ? months.map((m) => ({ month: m, value: detail.byMonth[m] ?? 0 })) : []), [months, detail])

  const detailMerchantItems = useMemo(
    (): BarListItem[] => (detail ? detailMerchants.slice(0, 8).map((m) => ({ key: m.merchant, label: m.merchant, value: m.total, meta: `${m.count}×`, color: categoryColor(detail.categoryId) })) : []),
    [detailMerchants, detail],
  )

  const merchantItems = useMemo(
    (): BarListItem[] => merchants.slice(0, 10).map((m) => ({ key: m.merchant, label: m.merchant, value: m.total, meta: `${m.count}× · ${CATEGORY_MAP[m.categoryId]?.label ?? ''}` })),
    [merchants],
  )

  const incomeItems = useMemo(
    (): BarListItem[] => incomeCats.map((c) => ({ key: c.categoryId, label: c.label, value: c.total, share: c.share, meta: `${c.count}×`, color: 'var(--series-income)' })),
    [incomeCats],
  )

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Categorias</h1>
            <p className="text-xs text-muted-foreground">
              {formatBRL(totalExpense)} em saídas e {formatBRL(totalIncome)} em entradas, de {formatMonthLong(months[0])} a {formatMonthLong(months[months.length - 1])}. Clique numa categoria de
              despesa para abrir os detalhes.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Despesas por mês e categoria</CardTitle>
          <CardDescription>
            As sete maiores categorias do conjunto; o restante agrupado em “Outras”.
            {projectedFrom ? ' Neste gráfico tudo é saída, então a hachura marca PREVISÃO: parcelas já contratadas, contas declaradas e rubricas.' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryStackChart categories={chartCategories} months={months} projectedFrom={projectedFrom} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Ranking de categorias</CardTitle>
            <CardDescription>Por grupo, do maior para o menor</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.group}>
                <div className="mb-2 flex items-baseline justify-between text-xs">
                  <span className="font-semibold">{categoryGroupLabel(g.group)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatBRL(g.total)} · {formatPercent(totalExpense ? g.total / totalExpense : 0)}
                  </span>
                </div>
                <BarList max={expenseCats[0]?.total} items={g.items} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* `min-w-0`: item de grid nasce com min-width auto e a tabela com min-w-[560px]
            impediria a coluna de encolher, empurrando a página na horizontal. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-3">
          {detail ? (
            <Card>
              <CardHeader>
                <CardTitle>{detail.label}</CardTitle>
                <CardDescription>
                  {CATEGORY_MAP[detail.categoryId]?.description ?? ''} · {detail.count} {plural(detail.count, 'lançamento', 'lançamentos')} · ticket médio {formatBRL(detail.total / detail.count)}
                </CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" onClick={() => select('')}>
                    Fechar
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <ChartContainer config={detailConfig} className={CHART_TOKENS} style={{ height: 160 }}>
                  <BarChart accessibilityLayer data={detailMonthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="32%">
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="month" tickFormatter={formatMonthShort} axisLine={{ stroke: 'var(--chart-grid)' }} tickLine={false} />
                    <YAxis tickFormatter={(v: number) => formatAxis(v)} axisLine={false} tickLine={false} width={70} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          className="min-w-44"
                          labelFormatter={(label) => formatMonthLongLabel(String(label))}
                          formatter={(value) => (
                            <span className="flex flex-1 items-center justify-between gap-4">
                              <span className="text-muted-foreground">{detail.label}</span>
                              <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                            </span>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="value" fill="var(--color-value)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ChartContainer>
                <div>
                  <h3 className="mb-2 text-xs font-semibold">Estabelecimentos</h3>
                  <BarList items={detailMerchantItems} />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-xs font-semibold">Lançamentos</h3>
                    <Button variant="link" size="sm" render={<Link to={`/transacoes?categoria=${detail.categoryId}&fluxo=expense`} />}>
                      Ver com filtros
                    </Button>
                  </div>
                  <TransactionTable key={detail.categoryId} rows={detailRows} compact />
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Cobranças recorrentes</CardTitle>
              <CardDescription>Contrapartes que aparecem em vários meses do período. Base para revisar assinaturas e contas fixas.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Seis colunas numa coluna estreita do grid: o padding padrão de célula
                  (p-2) somaria ~96px e jogaria "Último" para fora do cartão. */}
              <Table className="min-w-[560px] [&_:is(th,td)]:px-1.5">
                <TableHeader>
                  <TableRow>
                    <TableHead>Contraparte</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Meses</TableHead>
                    <TableHead className="text-right">Média/mês</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Último</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {recurring.slice(0, 20).map((r) => (
                    <TableRow key={r.merchant}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="max-w-44 truncate" title={r.merchant}>
                            {r.merchant}
                          </span>
                          <VariabilityBadge variability={r.variability} />
                        </span>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">
                        <CategoryBadge value={r.categoryId} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.months.length}/{months.length}
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(r.monthlyAverage)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBRL(r.total)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(r.lastDate)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Estado vazio DENTRO da tabela: o cabeçalho é o que explica o que a listagem contém. */}
                  {recurring.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <MagnifyingGlassMinus />
                            </EmptyMedia>
                            <EmptyTitle>Nenhuma contraparte se repete em três ou mais meses no recorte e no período selecionados.</EmptyTitle>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Como as categorias são atribuídas</CardTitle>
              <CardDescription>Regras por palavra-chave em scripts/rules.ts. Ajustes manuais na tabela de transações ficam salvos neste navegador.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {EXPENSE_CATEGORIES.map((c) => (
                  <li key={c.id} className="flex min-w-0 flex-wrap items-center gap-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={SERIES_SWATCH} style={{ background: categoryColor(c.id) }} aria-hidden />
                      {c.label}
                    </span>
                    <span className="text-muted-foreground">· {c.description}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Maiores estabelecimentos</CardTitle>
            <CardDescription>Soma das despesas por contraparte no período</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={merchantItems} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>De onde o dinheiro vem</CardTitle>
            <CardDescription>Categorias de entrada no período</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={incomeItems} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
