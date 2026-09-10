import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { CHART_TOKENS } from '@/components/charts/chart-theme'
import { EXPENSE_HATCH_SWATCH, expenseHatch, type LegendMark, MONEY_AXIS, MONEY_GRID, MONTH_AXIS, PROJECTION_DASH } from '@/components/charts/money-bar'
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
  rubric: { label: 'Rubricas', color: 'var(--primary)' },
  decided: { label: statusLabel('decided'), color: 'var(--primary)' },
  considering: { label: statusLabel('considering'), color: 'var(--primary)' },
} satisfies ChartConfig

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 }

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
/**
 * O vão entre as fatias, em pixels.
 *
 * Cada seção é um retângulo ISOLADO empilhado sobre o outro, e não um bloco contínuo — a mesma
 * marca que a tela de Previsão desenha em `VolumeBar`. O Recharts não sabe empilhar com folga,
 * então o vão sai de uma `shape` própria que encolhe o retângulo e arredonda os quatro cantos.
 */
const STRIPE_ID = 'wlet-plan-stripes'
const GAP = 3
const RADIUS = 4

/**
 * Quanto uma fatia esmaece quando o realce está ligado.
 *
 * Ela não SOME: a coluna precisa continuar tendo a altura que tem, senão o realce mentiria
 * sobre o tamanho do mês — que é justamente a pergunta que o gráfico responde.
 */
const DIMMED = 0.2

/**
 * O que a lista está apontando, para o gráfico acender.
 *
 * `byMonth` é quanto ESTE plano põe em cada mês — não o mês inteiro. É o que permite desenhar
 * a parte dele dentro de uma fatia que pode ter dinheiro de outros planos junto: a fatia
 * inteira esmaece e só a porção dele fica cheia.
 */
export interface PlanHighlight {
  /** Em qual das duas séries de plano ele cai, conforme a situação. */
  key: 'decided' | 'considering'
  byMonth: Record<string, number>
}

/**
 * Uma fatia: retângulo isolado, SEM preenchimento e de borda TRACEJADA.
 *
 * É a estilização de previsão do app, verificada nas duas telas que já a desenham: a `VolumeBar`
 * da Previsão (`background: transparent` + `1px dashed` na cor da série) e as `<Cell>` do
 * gráfico de fluxo da Visão geral (`fill: transparent` + `stroke` + o mesmo `4 4`).
 *
 * Com preenchimento e textura fora de jogo, quem carrega a identidade é a COR — que é o que a
 * §1 da `dataviz.md` reserva para isso, e é o que a Previsão faz com as cores de categoria.
 *
 * **Com realce ligado, a fatia ganha um segundo desenho por cima**: tudo esmaece e só a
 * PORÇÃO do plano apontado fica cheia, ancorada na base da fatia. A proporção sai do valor —
 * `share / value` da altura —, então ela é o tamanho real daquele dinheiro dentro do mês, e
 * não um destaque decorativo do segmento inteiro.
 */
function slice(key: keyof typeof scheduleConfig, { fill, stroke }: { fill?: string; stroke?: string }, highlight?: PlanHighlight) {
  return (props: { x?: number; y?: number; width?: number; height?: number; payload?: PlanRow }) => {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props
    if (height <= 0.5) return <g />
    const h = Math.max(1, height - GAP)
    const top = y + GAP
    const draw = (extra: { y: number; height: number; opacity?: number }) => (
      <rect
        x={x}
        width={width}
        rx={Math.min(RADIUS, extra.height / 2)}
        fill={fill ?? 'none'}
        stroke={stroke}
        strokeWidth={stroke ? 1 : 0}
        strokeDasharray={stroke ? PROJECTION_DASH : undefined}
        {...extra}
      />
    )

    if (!highlight) return draw({ y: top, height: h })

    const value = payload ? payload[key] : 0
    const share = key === highlight.key && payload ? (highlight.byMonth[payload.month] ?? 0) : 0
    if (share <= 0 || value <= 0) return draw({ y: top, height: h, opacity: DIMMED })

    // O plano nunca põe mais do que a fatia tem — mas arredondamento de centavos pode passar
    // por um fio, e uma sub-fatia mais alta que a fatia vazaria para cima dela.
    const sub = Math.max(1, Math.min(h, (h * Math.min(share, value)) / value))
    return (
      <g>
        {draw({ y: top, height: h, opacity: DIMMED })}
        {draw({ y: top + h - sub, height: sub })}
      </g>
    )
  }
}

/**
 * Como cada série é desenhada, e a regra é UMA: **o que já é fato segue o desenho normal; só o
 * PREVISTO fica vazado de traço tracejado.**
 *
 * É a mesma divisão que a Visão geral faz entre mês medido e mês projetado, e que a Previsão
 * faz entre fatia medida e fatia prevista. Aqui ela cai sobre a ORIGEM em vez do mês: a parcela
 * de cartão que já vai ser debitada nas próximas faturas é fato — ela é desenhada cheia, com a
 * hachura de saída do app —, e o que a Previsão projeta (conta declarada e rubrica) é previsão,
 * e fica oco.
 *
 * Dois MATIZES separam os dois grupos: `--series-expense` é o que o mês já tem por conta
 * própria, `--primary` é o que a sua lista acrescenta.
 */
const DRAW = {
  /** Parcela já comprada: FATO. Hachura de saída, a mesma marca da Visão geral. */
  committed: { fill: `url(#${STRIPE_ID})` },
  /** Conta declarada: previsto. Oco e tracejado. */
  declared: { stroke: 'var(--series-expense)' },
  /** Rubrica: previsto, e o mais incerto dos dois — traço mais apagado. */
  rubric: { stroke: 'color-mix(in oklab, var(--series-expense) 62%, var(--card))' },
  /** Plano decidido: você já assumiu, então é cheio — no matiz da sua lista. */
  decided: { fill: 'var(--primary)' },
  /** Plano em estudo: hipótese. Oco e tracejado, no mesmo matiz. */
  considering: { stroke: 'var(--primary)' },
} as const

/** As marcas da legenda, e as MESMAS amostras que o tooltip reusa — nunca duas descrições. */
const MARKS: Record<keyof typeof scheduleConfig, LegendMark> = {
  committed: { label: originLabel('committed'), background: EXPENSE_HATCH_SWATCH, ring: true },
  declared: { label: originLabel('declared'), dashed: 'var(--series-expense)' },
  rubric: { label: 'Rubricas', dashed: 'color-mix(in oklab, var(--series-expense) 62%, var(--card))' },
  decided: { label: statusLabel('decided'), background: 'var(--primary)' },
  considering: { label: statusLabel('considering'), dashed: 'var(--primary)' },
}

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
/**
 * A ORDEM da pilha, de baixo para cima — e a mesma que a legenda lê da esquerda para a direita.
 *
 * As duas saem daqui e não de duas listas escritas à mão: legenda e desenho que se ordenam
 * sozinhos divergem no primeiro ajuste, e aí o quadradinho passa a nomear a fatia errada.
 *
 * A ordem é a da CERTEZA: parcela já comprada na base, hipótese no topo.
 */
const ORDER = ['committed', 'declared', 'rubric', 'decided', 'considering'] as const

/** O que o mês custaria: as cinco fatias somadas. */
const total = (row: PlanRow) => row.committed + row.declared + row.rubric + row.decided + row.considering

export function PlanScheduleChart({ data, height = 260, headline, highlight }: { data: PlanRow[]; height?: number; headline?: ReactNode; highlight?: PlanHighlight }) {
  const containerStyle = useMemo(() => ({ height }), [height])

  return (
    <div className="flex flex-col gap-3">
      <ChartHeader headline={headline} marks={ORDER.map((key) => MARKS[key])} />

      <ChartContainer config={scheduleConfig} className={CHART_TOKENS} style={containerStyle}>
        <BarChart accessibilityLayer data={data} margin={CHART_MARGIN} barCategoryGap="14%">
          {expenseHatch(STRIPE_ID)}

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
          {/* Uma <Bar> por série, na ORDEM declarada: o Recharts empilha na ordem dos filhos,
              então a primeira é a base — e é a primeira da legenda. */}
          {ORDER.map((key) => (
            <Bar key={key} dataKey={key} stackId="a" maxBarSize={64} shape={slice(key, DRAW[key], highlight)} isAnimationActive={false} />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  )
}
