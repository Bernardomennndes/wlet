import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS, hatchBackground } from '@/components/charts/chart-theme'
import { hatchDefs, type LegendMark, MONEY_AXIS, MONEY_GRID, MONTH_AXIS, PROJECTION_DASH } from '@/components/charts/money-bar'
import { ChartHeader, MarkSwatch } from '@/components/charts/money-bar-chart'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { planStatuses } from '@/data/types'
import { forecastOrigins } from '@/lib/forecast'
import { formatBRL, formatMonthLongLabel } from '@/lib/format'
/**
 * A linha do gráfico: a saída prevista aberta por ORIGEM, mais as duas fatias de plano.
 *
 * As três primeiras vêm de `ForecastSources` e não se somam numa base só de propósito — a
 * pergunta desta tela é o quanto de um mês já está preso. Uma parcela de cartão comprada é
 * FATO e não se desfaz; uma rubrica de supermercado é ESTIMATIVA e cede se você quiser. Ver
 * as duas como um bloco cinza só faria as duas parecerem igualmente inegociáveis.
 */
export interface PlanRow {
  month: string
  /** Parcelas de cartão já compradas. Fato. */
  committed: number
  /** Contas declaradas, LÍQUIDAS do que as cobranças abatem — o aluguel menos o rateio. */
  declared: number
  /** Rubricas por categoria: o supermercado e afins. Estimativa. */
  rubric: number
  decided: number
  considering: number
}

/** Os rótulos saem da lista de enum do domínio — o gráfico não redigita "Decidido". */
const statusLabel = (value: string) => planStatuses.find((s) => s.value === value)?.label ?? value

/** Os rótulos das origens saem da lista de domínio — o gráfico não redigita "Contratado". */
const originLabel = (value: string) => forecastOrigins.find((o) => o.value === value)?.label ?? value

const scheduleConfig = {
  committed: { label: originLabel('committed'), color: 'var(--primary)' },
  declared: { label: originLabel('declared'), color: 'var(--primary)' },
  rubric: { label: originLabel('rubric'), color: 'var(--primary)' },
  decided: { label: statusLabel('decided'), color: 'var(--primary)' },
  considering: { label: statusLabel('considering'), color: 'var(--primary)' },
} satisfies ChartConfig

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }
const STRIPE_ID = 'wallet-plan-stripes'

/**
 * Os três degraus do que o mês JÁ TEM PRESO, em ordem de certeza.
 *
 * A `dataviz.md` §3 diz que densidade do preenchimento é o canal de "quanto já aconteceu", e é
 * ele que ordena os três: parcela comprada é o tom cheio (fato), conta declarada é média
 * (compromisso), rubrica é a mais esmaecida (estimativa) — cada uma um passo mais perto do
 * fundo do cartão.
 *
 * **A TEXTURA fica reservada aos planos**, e essa é a correção de uma primeira tentativa que
 * hachurou a rubrica: no quadradinho de 14px da legenda ela ficou indistinguível do "Decidido",
 * porque os dois cinzas do app (`--series-other` e `--series-expense`) quase não se separam
 * nesse tamanho. Com a hachura significando uma coisa só — "isto veio da sua lista" — ela
 * volta a distinguir o que a tela é sobre.
 */
const COMMITTED_FILL = 'var(--primary)'
const DECLARED_FILL = 'color-mix(in oklab, var(--primary) 62%, var(--card))'
const RUBRIC_FILL = 'color-mix(in oklab, var(--primary) 30%, var(--card))'

/**
 * A hachura e o contorno dos planos, também em `--primary`.
 *
 * `--primary` INVERTE com o tema — preta no claro, branca no escuro —, então o gráfico inteiro
 * acompanha sem que nada precise ser declarado por tema. Os degraus são misturas com `--card`,
 * que inverte junto: o passo "38% da primária sobre o cartão" clareia no tema claro e escurece
 * no escuro, e a ordem de densidade se preserva nos dois.
 */
const PLAN_HATCH = hatchBackground('var(--primary)', 'transparent')

/** As marcas da legenda, e as MESMAS amostras que o tooltip reusa — nunca duas descrições. */
const MARKS: Record<keyof typeof scheduleConfig, LegendMark> = {
  committed: { label: originLabel('committed'), background: COMMITTED_FILL },
  declared: { label: originLabel('declared'), background: DECLARED_FILL, ring: true },
  rubric: { label: originLabel('rubric'), background: RUBRIC_FILL, ring: true },
  decided: { label: statusLabel('decided'), background: PLAN_HATCH, ring: true },
  considering: { label: statusLabel('considering'), dashed: 'var(--primary)' },
}

/**
 * O raio vai para a série que está no TOPO daquela coluna — a última com valor.
 *
 * Fixá-lo numa série só deixaria de topo reto todo mês em que ela não existe, ao lado de um
 * mês arredondado. Com cinco séries isso aconteceria o tempo todo.
 */
/** O que o mês custaria: as cinco fatias somadas. */
const total = (row: PlanRow) => row.committed + row.declared + row.rubric + row.decided + row.considering

const topRadius = (acima: number[]) => (acima.some((v) => v > 0) ? 0 : ([5, 5, 0, 0] as unknown as number))

/**
 * A agenda de desembolso dos planos, mês a mês.
 *
 * É o gráfico de fluxo da Visão geral traduzido, e a tradução tem um ponto que precisa ficar
 * dito: lá as duas séries são entrada × saída, e a HACHURA carrega esse eixo. Aqui tudo é
 * saída, então a textura não separa nada — é a §1.1 da `dataviz.md`, que nesse caso a libera
 * para o eixo seguinte. O eixo seguinte desta tela é **decidido × em estudo**: o que já entra
 * na previsão contra o que ainda é hipótese.
 *
 * Daí a codificação, que é a mesma da §3 aplicada a outra pergunta: o decidido é marca CHEIA
 * (hachurada, na cor de saída) e o em estudo é marca OCA de traço tracejado — o mesmo traço do
 * divisor de projeção, que no app inteiro quer dizer "ainda não é fato". Matiz não muda entre
 * as duas: é o mesmo dinheiro saindo, e a diferença é o compromisso.
 *
 * A base — "Já previsto" — é o que o mês já tem sem os planos: parcelas de cartão já compradas,
 * contas declaradas e rubricas, menos o que as cobranças abatem. Ela existe para o gráfico
 * responder "CABE?" e não só "quanto custa": um plano de R$ 1.100 num mês que já tem R$ 4.000
 * comprometidos é outra coisa do mesmo plano num mês vazio.
 *
 * **Não há divisor de projeção nem véu**, ao contrário do gráfico de origem. Lá eles separam o
 * medido do previsto; aqui TUDO é planejamento, e desenhar a fronteira anunciaria uma que não
 * existe.
 *
 * **A coluna é larga (`maxBarSize={64}`) mesmo sendo empilhada**, e isso é desvio declarado da
 * regra de 24px. Aquele limite existe porque o empilhado de Categorias tem oito séries, e num
 * segmento de 4px a hachura vira ruído. Aqui são DUAS, uma delas oca: não há segmento fino a
 * proteger, e a largura é o que faz este gráfico ser lido como irmão do da Visão geral, que é
 * de onde ele veio.
 */
export function PlanScheduleChart({ data, height = 260, headline }: { data: PlanRow[]; height?: number; headline?: ReactNode }) {
  const containerStyle = useMemo(() => ({ height }), [height])

  return (
    <div className="flex flex-col gap-3">
      <ChartHeader headline={headline} marks={[MARKS.committed, MARKS.declared, MARKS.rubric, MARKS.decided, MARKS.considering]} />

      <ChartContainer config={scheduleConfig} className={CHART_TOKENS} style={containerStyle}>
        <BarChart accessibilityLayer data={data} margin={CHART_MARGIN} barCategoryGap="14%">
          {hatchDefs([{ id: STRIPE_ID, stripe: 'var(--primary)', fill: 'var(--card)' }])}

          <CartesianGrid {...MONEY_GRID} />
          <XAxis {...MONTH_AXIS} />
          <YAxis {...MONEY_AXIS} />

          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-48"
                labelFormatter={(label) => formatMonthLongLabel(String(label))}
                formatter={(value, name, item, index) => (
                  <>
                    <span className="flex flex-1 items-center justify-between gap-6">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <MarkSwatch mark={MARKS[name as keyof typeof MARKS]} />
                        {MARKS[name as keyof typeof MARKS]?.label}
                      </span>
                      <span className="font-medium tabular-nums">{formatBRL(Number(value))}</span>
                    </span>
                    {index === 4 ? (
                      <div className="basis-full border-t border-border pt-1.5 text-muted-foreground">
                        Total do mês: <strong className="text-foreground">{formatBRL(total(item.payload as PlanRow))}</strong>
                      </div>
                    ) : null}
                  </>
                )}
              />
            }
          />

          {/* Empilhadas, da mais CERTA para a mais incerta: parcela comprada na base, hipótese
              no topo. A altura total é o que o mês custaria; a leitura de baixo para cima diz
              quanto disso ainda se pode mudar de ideia. */}
          <Bar dataKey="committed" stackId="a" maxBarSize={64} fill={COMMITTED_FILL} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={topRadius([row.declared, row.rubric, row.decided, row.considering])} />
            ))}
          </Bar>
          <Bar dataKey="declared" stackId="a" maxBarSize={64} fill={DECLARED_FILL} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={topRadius([row.rubric, row.decided, row.considering])} />
            ))}
          </Bar>
          <Bar dataKey="rubric" stackId="a" maxBarSize={64} fill={RUBRIC_FILL} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={topRadius([row.decided, row.considering])} />
            ))}
          </Bar>
          <Bar dataKey="decided" stackId="a" maxBarSize={64} fill={`url(#${STRIPE_ID})`} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} radius={topRadius([row.considering])} />
            ))}
          </Bar>
          <Bar dataKey="considering" stackId="a" maxBarSize={64} radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.month} fill="transparent" stroke="var(--primary)" strokeWidth={1} strokeDasharray={PROJECTION_DASH} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
