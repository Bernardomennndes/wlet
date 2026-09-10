import { TrendUp } from '@phosphor-icons/react'
import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { NotInformed } from '@/components/not-informed'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { formatBRL, formatDate, formatPercent, plural } from '@wlet/lib/format'
import { assetClasses, INCOME, INVESTMENTS, PATRIMONY, PATRIMONY_RANGES, yieldOf, type PatrimonyRange } from '@/lib/investments'
import { lastMonthWithData, shiftMonth } from '@/lib/finance'
import { useFilters } from '@/providers/use-filters'

/** O maior de dois meses — o piso da janela não pode ser anterior ao primeiro ponto da série. */
const maxMonth = (a: string, b: string) => (a > b ? a : b)
import { cn } from '@wlet/lib/utils'
import { PATRIMONIO_METRICS } from './-metric-definitions'
import { AllocationTreemap } from './-components/allocation-treemap'
import { AssetClassTiles } from './-components/asset-class-tiles'
import { BenchmarkCard } from './-components/benchmark-card'
import { HoldingsStrip } from './-components/holdings-strip'
import { IncomeCard } from './-components/income-card'
import { PatrimonyChart } from './-components/patrimony-chart'
import { PatrimonyHero } from './-components/patrimony-hero'

export function PatrimonioPageContent() {
  useDocumentTitle('Patrimônio')
  const { period, setPeriod } = useFilters()

  /**
   * Os atalhos (3M, 6M, 1A, Tudo) escrevem no PERÍODO GLOBAL, não num estado desta tela.
   *
   * Antes eram uma janela própria em `?janela=`, e a tela ficava com dois controles de
   * período ao mesmo tempo: o do cabeçalho, que não fazia nada aqui, e este. Um controle
   * visível que não age ensina a desconfiar do controle em todas as outras telas.
   *
   * A janela dos atalhos termina no último mês COM DADOS e não no fim do período atual: eles
   * são sobre a série de patrimônio, que é histórica, e "3M" tem de dizer os três últimos
   * meses medidos — não três meses vazios à frente.
   */
  const applyRange = (value: PatrimonyRange) => {
    const last = PATRIMONY.at(-1)?.month ?? lastMonthWithData()
    const months = PATRIMONY_RANGES.find((r) => r.value === value)?.months ?? Number.POSITIVE_INFINITY
    const first = PATRIMONY[0]?.month ?? last
    setPeriod({ from: Number.isFinite(months) ? maxMonth(first, shiftMonth(last, 1 - months)) : first, to: last })
  }

  /** O atalho aceso é o que DESCREVE o período atual; período escolhido à mão não acende nenhum. */
  const activeRange = PATRIMONY_RANGES.find((r) => {
    const last = PATRIMONY.at(-1)?.month ?? lastMonthWithData()
    const first = PATRIMONY[0]?.month ?? last
    const from = Number.isFinite(r.months) ? maxMonth(first, shiftMonth(last, 1 - r.months)) : first
    return period.from === from && period.to === last
  })?.value

  const last = PATRIMONY.at(-1)
  const gain = last ? yieldOf(last) : 0
  const fixed = INVESTMENTS?.holdings.filter((h) => h.kind === 'fixed-income') ?? []
  const equity = INVESTMENTS?.holdings.filter((h) => h.kind === 'equity') ?? []

  if (!INVESTMENTS || !last) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Patrimônio</h1>
        </header>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendUp />
            </EmptyMedia>
            <EmptyTitle>Nenhum relatório de investimentos</EmptyTitle>
            <EmptyDescription>
              Exporte a posição, a movimentação e o extrato da corretora para <code className="font-mono">docs/investimentos/</code>, junto do cache do CDI. Depois leia a pasta em{' '}
              <strong className="font-medium text-foreground">Meus dados</strong>, ou rode <code className="font-mono">pnpm ingest</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const patrimony = INVESTMENTS.total + INVESTMENTS.cash
  const classes = assetClasses(INVESTMENTS)
  // A série mostrada é cortada pelo PERÍODO do cabeçalho, como em toda outra tela. O corte é
  // de EXIBIÇÃO: `PATRIMONY` continua reconstruído desde o primeiro mês, senão o rendimento
  // acumulado passaria a depender do filtro.
  const windowed = PATRIMONY.filter((p) => p.month >= period.from && p.month <= period.to)

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Patrimônio</h1>
            <p className="text-xs text-muted-foreground">A carteira reconstruída mês a mês. O rendimento é a distância entre o aportado e o total.</p>
          </div>
        </div>
      </header>

      <KpiCardGrid columns={3}>
        <KpiCard
          label="Patrimônio"
          definition={PATRIMONIO_METRICS.current}
          value={formatBRL(patrimony)}
          hint={`${formatBRL(INVESTMENTS.total)} em papéis (B3, ${formatDate(INVESTMENTS.asOf)}) + ${formatBRL(INVESTMENTS.cash)} em caixa`}
        />
        <KpiCard label="Aportado" definition={PATRIMONIO_METRICS.contributed} value={formatBRL(last.contributed)} hint="Líquido de resgates, pelo extrato da corretora" />
        <KpiCard
          label="Rendimento"
          definition={PATRIMONIO_METRICS.gain}
          value={formatBRL(gain)}
          tone={gain < 0 ? 'risk' : 'success'}
          hint={last.contributed > 0 ? `${formatPercent(gain / last.contributed, 1)} sobre o aportado` : undefined}
        />
      </KpiCardGrid>

      {/* A silhueta da referência: composição à esquerda, curva à direita. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Composição</CardTitle>
            <CardDescription>Onde o patrimônio está hoje.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <AssetClassTiles classes={classes} />
          </CardContent>
        </Card>
        <PatrimonyHero data={windowed} range={activeRange} onRangeChange={applyRange} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Papéis</CardTitle>
          <CardDescription>
            {INVESTMENTS.holdings.length} {plural(INVESTMENTS.holdings.length, 'papel', 'papéis')} na posição de {formatDate(INVESTMENTS.asOf)}. A largura da barra é a concentração.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HoldingsStrip holdings={INVESTMENTS.holdings} total={patrimony} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Proventos</CardTitle>
            <CardDescription>Dividendo, JCP e rendimento dos últimos 12 meses. Não são aporte: entram no patrimônio sem sair do seu bolso.</CardDescription>
          </CardHeader>
          <CardContent>{INCOME.length === 0 ? <NotInformed>Nenhum provento no extrato da corretora</NotInformed> : <IncomeCard income={INCOME} until={last.month} />}</CardContent>
        </Card>
        <BenchmarkCard data={PATRIMONY} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alocação</CardTitle>
          <CardDescription>Cada bloco é um papel, e a largura é a fatia dele no patrimônio. O caixa entra hachurado, porque é patrimônio mas não é posição.</CardDescription>
        </CardHeader>
        <CardContent>
          <AllocationTreemap holdings={INVESTMENTS.holdings} cash={INVESTMENTS.cash} total={patrimony} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mês a mês</CardTitle>
          <CardDescription>
            {PATRIMONY.length} {plural(PATRIMONY.length, 'mês', 'meses')} desde {PATRIMONY[0].month.replace('-', '/')}, dividido por classe.{' '}
            <strong className="font-medium">Ações entram a custo</strong> nos meses passados; o último usa a posição real da B3.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PatrimonyChart data={PATRIMONY} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posição em {formatDate(INVESTMENTS.asOf)}</CardTitle>
          <CardDescription>
            Do relatório da B3 (<code className="font-mono">{INVESTMENTS.source}</code>). Renda fixa na curva, variável a fechamento; o caixa vem da corretora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataList aria-label="Posição da carteira">
            {[
              { title: 'Renda fixa', items: fixed },
              { title: 'Ações e BDR', items: equity },
            ].map((group) => (
              <DataListItem key={group.title} className="gap-2">
                <DataListItemHeader>
                  <span>{group.title}</span>
                  <span className="tabular-nums">{formatBRL(group.items.reduce((s, h) => s + h.value, 0))}</span>
                </DataListItemHeader>
                {group.items.length === 0 ? (
                  <NotInformed>Nenhum papel</NotInformed>
                ) : (
                  <DataListItemFields>
                    {group.items.map((holding, i) => (
                      <DataListField key={holding.code} separator={i > 0} label={holding.code}>
                        {formatBRL(holding.value)}
                      </DataListField>
                    ))}
                  </DataListItemFields>
                )}
              </DataListItem>
            ))}
            {/* O caixa não é papel e não está no relatório da B3 — mas é dinheiro seu na
                corretora, e some da soma se ficar de fora. */}
            <DataListItem className="gap-2">
              <DataListItemHeader>
                <span>Caixa</span>
                <span className="tabular-nums">{formatBRL(INVESTMENTS.cash)}</span>
              </DataListItemHeader>
              <p className="text-xs text-muted-foreground">Parado na corretora, entre um resgate e a próxima aplicação. Vem do extrato da corretora, não da B3.</p>
            </DataListItem>
          </DataList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>De onde vêm estes números</CardTitle>
          <CardDescription>Quatro fontes, e cada uma responde uma pergunta que as outras não respondem.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={cn('flex list-inside list-disc flex-col gap-1.5 text-xs text-muted-foreground')}>
            <li>
              <strong className="font-medium text-foreground">A posição da B3 diz o que você TEM.</strong> Ações e BDR a mercado, renda fixa na curva — na data em que o relatório foi exportado.
            </li>
            <li>
              <strong className="font-medium text-foreground">A movimentação da B3 diz QUANDO cada papel entrou.</strong> É o que permite reconstruir os meses anteriores: o percentual do CDI de cada
              CDB é derivado do principal aplicado até o valor de hoje.
            </li>
            <li>
              <strong className="font-medium text-foreground">O extrato da corretora diz o que é SEU dinheiro novo.</strong> Ele é a única fonte que vê as duas pontas, e sem ele o aportado sai errado:
              parte do resgate volta ao banco como TED nominal do titular, que nenhuma regra sobre &ldquo;conta investimento&rdquo; reconhece. É dele que saem também os proventos e o caixa.
            </li>
            <li>
              <strong className="font-medium text-foreground">O CDI vem do Banco Central</strong> (série SGS 12, por <code className="font-mono">pnpm cdi</code>) e serve duas vezes: valora a renda
              fixa no passado e forma o benchmark, aplicado aos MESMOS aportes nas mesmas datas.
            </li>
            <li>
              <strong className="font-medium text-foreground">A conferência é a soma do extrato.</strong> O <code className="font-mono">pnpm ingest</code> exige que todo lançamento da corretora,
              somado desde o primeiro, dê o saldo que ela declara. Se não der, o terminal avisa — e aí estes números não valem.
            </li>
            <li>
              <strong className="font-medium text-foreground">Não há cotação ao vivo.</strong> Por isso esta tela não tem variação do dia por papel nem gráfico de candles: a B3 exporta posição, não
              mercado, e ações entram na série a custo nos meses passados.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
