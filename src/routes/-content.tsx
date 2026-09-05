import { AlertTriangle, Lightbulb, Repeat, TrendingUp } from 'lucide-react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { KpiCard, KpiCardGrid, KpiHeadline, SecondaryKpiGrid } from '@/components/kpi'
import { categoryLabel } from '@/data/categories'
import { TransactionTable, TransactionTablePagination } from '@/components/transaction-table'
import { useTransactionPaging } from '@/hooks/use-transaction-paging'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { detectRecurring, lastCompleteMonth, lastMonthWithData, sum, summarizeByCategory, summarizeByMerchant, summarizeByMonth, toCents } from '@/lib/finance'
import { buildCategoryForecast, buildForecast, committedFor } from '@/lib/forecast'
import { formatBRL, formatMonthLong, formatMonthShort, formatPercent, plural } from '@/lib/format'
import { plannedInScope } from '@/lib/planned'
import { useFilters } from '@/providers/use-filters'
import type { FlowPoint } from './-components/monthly-flow-chart'
import { BudgetCard } from './-components/budget-card'
import { GoalsCard } from './-components/goals-card'
import { SpendingOverviewCard } from './-components/spending-overview-card'
import { MonthlyFlowChart } from './-components/monthly-flow-chart'
import type { ExpenseSegment } from './-components/expense-segments'
import { MonthlyList } from './-components/monthly-list'
import { OVERVIEW_METRICS } from './-metric-definitions'

export function OverviewPageContent() {
  useDocumentTitle('Visão geral')
  const { transactions, history, months, scope } = useFilters()
  const [params, setParams] = useSearchParams()

  // O mês aberto vive na URL: o estado sobrevive a recarga e o link é compartilhável.
  // Mês projetado não entra: ele não tem lançamento nenhum para listar, e abrir a gaveta
  // nele mostrava "0 lançamentos · R$ 0,00" como se fosse medição.
  const selected = params.get('mes') ?? ''
  const openMonth = months.includes(selected) && selected <= lastMonthWithData() ? selected : ''
  // Inicial pelo link direto: abrir em `?mes=` já deixa a lembrança correta sem evento nenhum.
  const [rememberedMonth, setRememberedMonth] = useState(openMonth)

  // Só a chave `mes` é reescrita: passar um objeto ao `setParams` troca a query INTEIRA,
  // e o recorte, o período e o tema sumiam do endereço no primeiro clique — justamente
  // o que o link compartilhável precisava carregar.
  const selectMonth = (month: string) => {
    if (month) setRememberedMonth(month)
    const next = new URLSearchParams(params)
    if (month) next.set('mes', month)
    else next.delete('mes')
    setParams(next, { replace: true })
  }

  const monthly = useMemo(() => summarizeByMonth(transactions, months), [transactions, months])

  // Quem manda no horizonte é o filtro do cabeçalho. Se o período escolhido passa do
  // último mês com lançamentos, esses meses entram vazios e o gráfico os marca como previsão.
  const projectedFrom = useMemo(() => months.find((m) => m > lastMonthWithData()), [months])

  // Meses do período que de fato têm lançamentos. Estender o filtro para o futuro não
  // pode diluir médias nem apagar tendências: tudo que divide por "quantidade de meses"
  // usa esta lista, não o tamanho do período.
  const monthsWithData = useMemo(() => monthly.filter((m) => m.count > 0).map((m) => m.month), [monthly])

  // Previsão dos meses que passam do último com lançamentos: regras cadastradas em
  // Previsão mais as parcelas de cartão já contratadas. Nada é extrapolado do histórico.
  const forecast = useMemo(
    () =>
      buildForecast({
        history,
        planned: plannedInScope(scope),
        targets: months.filter((m) => m > lastMonthWithData()),
      }),
    [history, scope, months],
  )

  // O último mês com dados quase sempre está em curso: a fatura ainda não fechou, e as
  // parcelas já contratadas que vão cair nele não estão no extrato nem na previsão, que só
  // começa DEPOIS dele. Elas entram aqui — no gráfico e na lista, não nos KPIs medidos.
  const partialMonth = lastMonthWithData()
  const partial = useMemo(() => committedFor(history, [partialMonth]), [history, partialMonth])
  const partialCommitted = partial.byMonth.get(partialMonth) ?? 0

  // O gráfico e a tabela recebem medido e previsto juntos; os blocos do topo, não.
  const chartRows = useMemo<FlowPoint[]>(() => {
    const byMonth = new Map(forecast.map((f) => [f.month, f]))
    return monthly.map((m) => {
      const f = byMonth.get(m.month)
      if (f) return { ...m, income: f.income, expense: f.expense, net: f.net, committed: f.committed, projected: true, empty: f.empty }
      if (m.month !== partialMonth || partialCommitted <= 0) return m
      const expense = toCents(m.expense + partialCommitted)
      return { ...m, expense, net: toCents(m.income - expense), committed: partialCommitted, partial: true }
    })
  }, [monthly, forecast, partialMonth, partialCommitted])

  const forecastTotals = useMemo(
    () => ({
      income: sum(forecast.map((f) => f.income)),
      expense: sum(forecast.map((f) => f.expense)),
      committed: sum(forecast.map((f) => f.committed)),
      net: sum(forecast.map((f) => f.net)),
    }),
    [forecast],
  )
  const expenseCats = useMemo(() => summarizeByCategory(transactions, 'expense'), [transactions])

  // As saídas de cada mês abertas por categoria, para a barra de volume da lista. Os meses
  // medidos saem das transações; os projetados, da mesma previsão por categoria que a tela
  // de Categorias usa — senão a barra ficaria segmentada até setembro e sólida depois.
  const segmentsByMonth = useMemo(() => {
    const byMonth: Record<string, ExpenseSegment[]> = {}
    const add = (month: string, categoryId: string, value: number) => {
      if (value <= 0) return
      const list = (byMonth[month] ??= [])
      const found = list.find((s) => s.categoryId === categoryId)
      if (found) found.value += value
      else list.push({ categoryId, label: categoryLabel(categoryId), value })
    }
    for (const cat of expenseCats) for (const [month, value] of Object.entries(cat.byMonth)) add(month, cat.categoryId, value)
    const targets = months.filter((m) => m > lastMonthWithData())
    if (targets.length) {
      const forecastByCategory = buildCategoryForecast({ history, planned: plannedInScope(scope), targets })
      for (const [categoryId, monthsOfCategory] of Object.entries(forecastByCategory)) for (const [month, value] of Object.entries(monthsOfCategory)) add(month, categoryId, value)
    }
    for (const [categoryId, monthsOfCategory] of partial.byCategory) for (const [month, value] of monthsOfCategory) add(month, categoryId, value)
    for (const list of Object.values(byMonth)) list.sort((a, b) => b.value - a.value)
    return byMonth
  }, [expenseCats, months, history, scope, partial])
  const merchants = useMemo(() => summarizeByMerchant(transactions, 'expense'), [transactions])
  const recurring = useMemo(() => detectRecurring(merchants, months.length), [merchants, months.length])

  const income = sum(monthly.map((m) => m.income))
  const expense = sum(monthly.map((m) => m.expense))
  const net = income - expense

  const expenseCount = useMemo(() => transactions.filter((t) => t.flow === 'expense').length, [transactions])

  const lastMonth = lastCompleteMonth(months)
  const lastIdx = lastMonth ? months.indexOf(lastMonth) : -1
  const cur = lastIdx >= 0 ? monthly[lastIdx] : null
  const prev = lastIdx > 0 ? monthly[lastIdx - 1] : null
  const delta = (a?: number, b?: number) => (a !== undefined && b !== undefined && b !== 0 ? (a - b) / Math.abs(b) : null)
  const deltaLabel = cur && prev ? `${formatMonthShort(cur.month)} vs ${formatMonthShort(prev.month)}` : ''

  // As categorias do período, na forma que as duas barras de saída consomem.
  const periodSegments = useMemo<ExpenseSegment[]>(() => expenseCats.map((c) => ({ categoryId: c.categoryId, label: c.label, value: c.total })), [expenseCats])

  // O teto é do MÊS CORRENTE, então lê `history` e não o período do cabeçalho: estreitar o
  // filtro não pode fazer o gasto do mês encolher. O recorte PF/PJ continua valendo.
  const budgetMonth = lastMonthWithData()
  const budgetSpent = useMemo(() => sum(history.filter((t) => t.month === budgetMonth && t.flow === 'expense').map((t) => Math.abs(t.amount))), [history, budgetMonth])

  const insights = useMemo(() => buildInsights({ monthly, expenseCats, recurring, months: monthsWithData, scope }), [monthly, expenseCats, recurring, monthsWithData, scope])

  // Fechar o sheet limpa `?mes=` na hora, mas o painel ainda leva ~200ms deslizando para
  // fora — e medido, ele sai VAZIO já no primeiro quadro, com opacidade 1. Daí a lembrança
  // do último mês aberto, que só é lida enquanto `openMonth` está vazio.
  //
  // Duas restrições no formato disto, ambas do React Compiler: a lembrança é escrita no
  // HANDLER e não durante o render (um ref mutado no render faz o compilador desistir de
  // otimizar a página inteira), e o que entra na dependência do `useMemo` é a STRING do
  // mês, não a linha de `monthly` — `summarizeByMonth` escreve nas linhas que devolve, e
  // uma dependência que o compilador vê como mutável derruba a memoização do mesmo jeito.
  const sheetMonth = openMonth || rememberedMonth
  const sheetRow = monthly.find((m) => m.month === sheetMonth)
  const sheetRows = useMemo(() => transactions.filter((t) => t.month === sheetMonth), [transactions, sheetMonth])
  // A paginação vive aqui porque o rodapé dela é o rodapé do sheet, fora da tabela.
  const sheetPaging = useTransactionPaging(sheetRows)

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-2">
        <Breadcrumbs />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Visão geral</h1>
            <p className="text-xs text-muted-foreground">
              {formatMonthLong(months[0])} a {formatMonthLong(months[months.length - 1])} · {scope === 'all' ? 'todas as contas' : scope === 'PF' ? 'contas da pessoa física' : 'conta da empresa'} ·
              transferências entre suas contas não contam como entrada nem saída.
            </p>
          </div>
        </div>
      </header>

      {/* O resultado saiu daqui: virou a âncora do gráfico, como no layout de referência.
          Repetir o mesmo número em dois heróis na mesma tela só competiria por atenção. */}
      <KpiCardGrid columns={3}>
        <KpiCard label="Entradas no período" definition={OVERVIEW_METRICS.income} value={formatBRL(income)} hint={deltaHint(delta(cur?.income, prev?.income), deltaLabel, true)} />
        <KpiCard label="Saídas no período" definition={OVERVIEW_METRICS.expense} value={formatBRL(expense)} hint={deltaHint(delta(cur?.expense, prev?.expense), deltaLabel, false)} />
        <KpiCard
          label="Média mensal de saídas"
          definition={OVERVIEW_METRICS.expenseAverage}
          value={monthsWithData.length ? formatBRL(expense / monthsWithData.length) : null}
          hint={`${expenseCount} ${plural(expenseCount, 'despesa', 'despesas')} em ${monthsWithData.length} ${plural(monthsWithData.length, 'mês', 'meses')} com dados`}
        />
      </KpiCardGrid>

      {/* `items-start`: sem isso a grade estica os dois cartões até a altura do mais alto. */}
      {/* Quatro colunas só a partir de `xl`: em `lg` o cartão de metas cairia para 165px
          e os rótulos começariam a truncar. Sem `items-start` aqui — os dois cartões desta
          linha esticam até a mesma altura, e as metas distribuem a folga entre os itens. */}
      <div className="grid gap-5 lg:grid-cols-3 xl:grid-cols-4">
        <Card className="min-w-0 lg:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Entradas e saídas por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyFlowChart
              data={chartRows}
              projectedFrom={projectedFrom}
              headline={
                /* O headline vive DENTRO do Card do gráfico e fora de qualquer grade, então o
                   shell é o `KpiHeadline`: não é `HeroKpiCard` (que é um Card e aninharia dois)
                   nem `KpiCard` solto com o padding desfeito por className. */
                <KpiHeadline label="Resultado no período" definition={OVERVIEW_METRICS.net} value={formatBRL(net)} tone={net < 0 ? 'risk' : 'default'} />
              }
            />
            {forecast.length ? (
              <SecondaryKpiGrid
                className="mt-4"
                items={[
                  {
                    key: 'forecastExpense',
                    label: `Saídas previstas até ${formatMonthShort(forecast[forecast.length - 1].month)}`,
                    definition: OVERVIEW_METRICS.forecastExpense,
                    value: formatBRL(forecastTotals.expense),
                  },
                  { key: 'forecastCommitted', label: 'Dessas, já contratado em parcelas', definition: OVERVIEW_METRICS.forecastCommitted, value: formatBRL(forecastTotals.committed) },
                  { key: 'forecastIncome', label: 'Entradas previstas', definition: OVERVIEW_METRICS.forecastIncome, value: formatBRL(forecastTotals.income) },
                  {
                    key: 'netWithForecast',
                    label: 'Resultado do período com a previsão',
                    definition: OVERVIEW_METRICS.netWithForecast,
                    value: formatBRL(net + forecastTotals.net),
                    tone: net + forecastTotals.net < 0 ? ('risk' as const) : ('default' as const),
                  },
                ]}
              />
            ) : null}
          </CardContent>
        </Card>
        <GoalsCard />
      </div>

      {/* `items-start`: sem isso o grid estica os dois cartões até a altura do mais alto
          e sobra um vazio grande embaixo da tabela. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Mês a mês</CardTitle>
            <CardDescription>
              Clique num mês para ver os lançamentos dele. A barra é o movimento do mês inteiro: o bloco sólido são as entradas, e as saídas vêm fatiadas nas três maiores categorias mais o restante.
              “% das entradas” é outra leitura — quanto das entradas as saídas consumiram, o mesmo número da etiqueta no gráfico. Meses esmaecidos são previsão e não têm lançamentos para abrir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyList rows={chartRows} segmentsByMonth={segmentsByMonth} openMonth={openMonth} onSelect={selectMonth} />
          </CardContent>
        </Card>

        {/* O wrapper estica com a linha da grade para dar CURSO ao sticky: com `items-start`
            o item teria a altura do próprio card, e um sticky sem folga nunca sai do lugar.
            O `max-h` existe porque o card costuma passar da altura da tela — sem ele, o
            topo gruda e o resto dos sinais fica inalcançável. */}
        {/* Quem gruda é a COLUNA, não cada cartão: três `sticky` no mesmo `top` se
            empilhariam uns por cima dos outros.
            A coluna tem ALTURA FIXA — a tela menos o cabeçalho e o respiro — e não rola:
            rolando a coluna, ela cortava o cartão de gastos no meio de uma linha da legenda.
            Quem rola é o miolo de Oportunidades, que fica com o espaço que sobra. */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-19 lg:h-[calc(100svh-6rem)] lg:self-start">
          <SpendingOverviewCard className="shrink-0" expense={expense} income={income} segments={periodSegments} delta={delta(cur?.expense, prev?.expense)} deltaLabel={deltaLabel} />
          <BudgetCard className="shrink-0" spent={budgetSpent} month={budgetMonth} />
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="shrink-0">
              <CardTitle>Oportunidades</CardTitle>
              <CardDescription>Sinais automáticos para reduzir custos</CardDescription>
            </CardHeader>
            {/* `min-h-0` para o miolo encolher dentro do flex em vez de esticar o cartão. */}
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              {insights.length === 0 ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Lightbulb />
                    </EmptyMedia>
                    <EmptyTitle>Nada relevante neste recorte.</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ItemGroup role="presentation" className="has-data-[size=sm]:gap-3">
                  {insights.map((i) => (
                    <Item key={i.title} variant="outline" size="sm">
                      <ItemMedia variant="icon" className="text-muted-foreground">
                        <i.icon aria-hidden />
                      </ItemMedia>
                      <ItemContent className="gap-0.5">
                        <ItemTitle className="w-auto font-semibold">{i.title}</ItemTitle>
                        <ItemDescription className="line-clamp-none">{i.body}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* `max-w` na MESMA cadeia de variantes do componente: a classe base é
          `data-[side=right]:sm:max-w-sm` (384px) e vence um `sm:max-w-*` solto por
          especificidade — atributo + classe contra classe. O `TransactionTable` pede 720px.
          `showCloseButton={false}`: o botão do registry tem "Close" em inglês, e texto de
          tela é pt-BR; o "Fechar" abaixo faz o mesmo papel. */}
      <Sheet open={Boolean(openMonth)} onOpenChange={(open) => !open && selectMonth('')}>
        <SheetContent side="right" showCloseButton={false} className="gap-0 p-0 data-[side=right]:sm:max-w-4xl">
          {sheetRow ? (
            <>
              <SheetHeader className="flex-row items-start justify-between gap-4 border-b">
                <span className="flex flex-col gap-1.5">
                  <SheetTitle>Lançamentos de {formatMonthLong(sheetRow.month)}</SheetTitle>
                  <SheetDescription>
                    {sheetRow.count} {plural(sheetRow.count, 'lançamento', 'lançamentos')} · entradas {formatBRL(sheetRow.income)} · saídas {formatBRL(sheetRow.expense)} · resultado{' '}
                    {formatBRL(sheetRow.net)}
                  </SheetDescription>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button variant="link" size="sm" render={<Link to={`/transacoes?mes=${sheetRow.month}`} />}>
                    Ver com filtros
                  </Button>
                  <SheetClose render={<Button variant="ghost" size="sm" />}>Fechar</SheetClose>
                </span>
              </SheetHeader>
              {/* Quem rola é a tabela, não este bloco: assim o cabeçalho dela fica preso
                  no topo. `min-h-0` para o filho encolher dentro do flex em vez de
                  esticar o painel. */}
              {/* Sem padding: a tabela vai de borda a borda, e o respiro fica por conta
                  do `p-2` das próprias células. */}
              <div className="min-h-0 flex-1">
                <TransactionTable key={sheetRow.month} rows={sheetRows} paging={sheetPaging} scrollable />
              </div>
              <SheetFooter className="border-t p-4 px-6">
                <TransactionTablePagination paging={sheetPaging} />
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/**
 * Linha de variação do KPI: sem par de meses completos não há variação a mostrar, e aí o
 * `hint` é `undefined` — devolver um elemento vazio reservaria a altura de uma linha por nada.
 * `upIsGood` inverte a leitura da cor: subir é bom em entrada, ruim em saída.
 */
function deltaHint(delta: number | null, label: string, upIsGood: boolean) {
  if (delta === null) return undefined
  const good = delta >= 0 === upIsGood
  return (
    <span className="flex items-center gap-1">
      <span className={`font-medium ${good ? 'text-[var(--status-good-text)]' : 'text-[var(--status-critical)]'}`}>
        {delta >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta))}
      </span>
      <span>{label}</span>
    </span>
  )
}

interface Insight {
  title: string
  body: string
  icon: typeof TrendingUp
}

function buildInsights({
  monthly,
  expenseCats,
  recurring,
  months,
  scope,
}: {
  monthly: ReturnType<typeof summarizeByMonth>
  expenseCats: ReturnType<typeof summarizeByCategory>
  recurring: ReturnType<typeof detectRecurring>
  months: string[]
  scope: string
}): Insight[] {
  const out: Insight[] = []
  const complete = monthly.filter((m) => m.month < new Date().toISOString().slice(0, 7))

  const negative = complete.filter((m) => m.net < 0).sort((a, b) => a.net - b.net)
  if (negative.length > 0) {
    out.push({
      icon: AlertTriangle,
      title: `${negative.length} de ${complete.length} meses no vermelho`,
      body: `Saídas superaram entradas em ${[...negative]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((m) => formatMonthShort(m.month))
        .join(', ')}. Pior mês: ${formatMonthShort(negative[0].month)} (${formatBRL(negative[0].net)}).`,
    })
  }

  const fees = expenseCats.find((c) => c.categoryId === 'juros-multas')
  if (fees && fees.total > 50) {
    out.push({
      icon: AlertTriangle,
      title: `${formatBRL(fees.total)} em juros, multas e IOF`,
      body: 'Custo puramente financeiro. IOF vem de compras internacionais no cartão (OpenAI, Vercel, Supabase); juros e multa, de fatura paga com atraso. Pagar a fatura em dia e concentrar assinaturas em dólar num cartão sem IOF elimina quase tudo.',
    })
  }

  const subs = recurring.filter((r) => r.variability < 0.35 && ['assinaturas', 'tecnologia', 'saude', 'educacao', 'telefonia'].includes(r.categoryId))
  if (subs.length > 0) {
    const monthlyCost = sum(subs.map((s) => s.monthlyAverage))
    out.push({
      icon: Repeat,
      title: `${subs.length} ${plural(subs.length, 'cobrança recorrente', 'cobranças recorrentes')} ≈ ${formatBRL(monthlyCost)}/mês`,
      body: `${formatBRL(monthlyCost * 12)} por ano em ${subs
        .slice(0, 4)
        .map((s) => s.merchant)
        .join(', ')}${subs.length > 4 ? ' e outras' : ''}. Vale revisar o que ainda é usado.`,
    })
  }

  if (months.length >= 4) {
    const recent = months.slice(-3)
    const before = months.slice(0, -3)
    for (const cat of expenseCats.slice(0, 8)) {
      const recentAvg = sum(recent.map((m) => cat.byMonth[m] ?? 0)) / recent.length
      const beforeAvg = sum(before.map((m) => cat.byMonth[m] ?? 0)) / before.length
      if (beforeAvg > 100 && recentAvg > beforeAvg * 1.4) {
        out.push({
          icon: TrendingUp,
          title: `${cat.label} subiu ${formatPercent(recentAvg / beforeAvg - 1)}`,
          body: `Média de ${formatBRL(recentAvg)}/mês nos últimos 3 meses contra ${formatBRL(beforeAvg)} antes.`,
        })
        break
      }
    }
  }

  for (const cat of expenseCats.filter((c) => ['transporte', 'restaurantes'].includes(c.categoryId))) {
    if (cat.count >= 40) {
      out.push({
        icon: TrendingUp,
        title: `${cat.count} lançamentos em ${cat.label.toLowerCase()}`,
        body: `Ticket médio de ${formatBRL(cat.total / cat.count)}, total de ${formatBRL(cat.total)}. Gasto pulverizado: pequeno por vez, grande no acumulado.`,
      })
    }
  }

  if (scope === 'all') {
    const tech = expenseCats.find((c) => c.categoryId === 'tecnologia')
    if (tech && tech.total > 500) {
      out.push({
        icon: TrendingUp,
        title: 'Infra de tecnologia paga na pessoa física',
        body: `${formatBRL(tech.total)} em cloud e APIs saíram de cartões PF. Migrar para a conta PJ deduz da empresa e simplifica o acerto de pró-labore.`,
      })
    }
  }

  return out.slice(0, 5)
}
