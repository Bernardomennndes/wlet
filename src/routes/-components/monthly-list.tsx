import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { NotInformed } from '@/components/not-informed'
import { SERIES_SWATCH } from '@/components/charts/chart-theme'
import { INCOME_VAR } from '@/lib/chart-tokens'
import { formatBRL, formatMonthLong, formatMonthLongLabel, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { splitExpense, type ExpenseSegment, type SegmentPart } from './expense-segments'
import type { FlowPoint } from './monthly-flow-chart'

interface Props {
  rows: FlowPoint[]
  /** Saídas por categoria de cada mês, do maior para o menor. */
  segmentsByMonth: Record<string, ExpenseSegment[]>
  /** Mês aberto na gaveta de lançamentos, ou '' quando nenhum está. */
  openMonth: string
  onSelect: (month: string) => void
}

/**
 * Os meses do período, um item por mês.
 *
 * É lista e não tabela por uma razão de layout: a tabela de seis colunas vivia num terço
 * da largura, ao lado de "Oportunidades", e rolava na horizontal a partir de 520px. O que
 * se perde é varrer uma coluna para achar o pior mês — e é a barra de volume que devolve
 * isso, porque a comparação passa a ser de comprimento, não de alinhamento.
 */
export function MonthlyList({ rows, segmentsByMonth, openMonth, onSelect }: Props) {
  return (
    <DataList aria-label="Meses do período">
      {rows.map((month) => (
        <MonthItem key={month.month} month={month} segments={segmentsByMonth[month.month] ?? []} open={month.month === openMonth} onSelect={onSelect} />
      ))}
    </DataList>
  )
}

function MonthItem({ month, segments, open, onSelect }: { month: FlowPoint; segments: ExpenseSegment[]; open: boolean; onSelect: (month: string) => void }) {
  const name = formatMonthLongLabel(month.month)
  // Mês previsto não tem lançamentos para listar: nada de clique nele.
  const selectable = !month.projected
  const toggle = () => onSelect(open ? '' : month.month)
  const ratio = month.income > 0 ? month.expense / month.income : null
  const parts = splitVolume(month.income, month.expense, segments)

  return (
    <DataListItem selected={open} onClick={selectable ? toggle : undefined} className={cn('gap-2', month.projected && 'text-muted-foreground opacity-50', selectable && 'cursor-pointer')}>
      <DataListItemHeader>
        <span className="flex items-center gap-1.5">
          {selectable ? (
            // Botão real: a linha inteira responde ao mouse, mas o teclado precisa de um
            // alvo focável. O que ele abre é um DIÁLOGO, então o anúncio correto é
            // `haspopup`: `aria-controls` apontaria para um id que só existe enquanto o
            // sheet está montado, e `aria-expanded` descreve conteúdo que se revela na
            // própria página.
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                toggle()
              }}
              aria-haspopup="dialog"
              className="rounded-sm text-left underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {name}
            </button>
          ) : (
            name
          )}
          {/* Sem badge, por decisão de layout: o que marca o mês previsto é a opacidade.
              Opacidade não existe para leitor de tela, então a palavra fica em `sr-only` —
              senão o mês projetado seria indistinguível de um medido para quem ouve. */}
          {month.projected ? <span className="sr-only">Previsão</span> : null}
        </span>
        <span className="flex items-baseline gap-2">
          {/* Quanto das entradas as saídas consumiram — o mesmo número da etiqueta no
              gráfico. Fica aqui, e não na barra, porque a barra passou a medir o volume. */}
          {ratio === null ? null : <span className={cn('font-normal text-muted-foreground tabular-nums', ratio > 1 && 'text-[var(--status-critical)]')}>{formatPercent(ratio, 1)} das entradas</span>}
          {/* Zero não é resultado bom: é neutro. Colorir tudo que não é negativo deixava a
              coluna inteira verde na visão PJ, onde todo mês fecha exatamente em zero. */}
          <span className={cn('tabular-nums', month.net < 0 && 'text-[var(--status-critical)]', month.net > 0 && 'text-[var(--status-good-text)]')}>{formatBRL(month.net)}</span>
        </span>
      </DataListItemHeader>

      {month.empty ? (
        <NotInformed>Nada previsto</NotInformed>
      ) : (
        <>
          {/* A descrição do leitor de tela é frase, então o mês vai em minúscula ali. */}
          <VolumeBar parts={parts} month={formatMonthLong(month.month)} />
          <DataListItemFields>
            <DataListField label="Entradas" separator={false}>
              {formatBRL(month.income)}
            </DataListField>
            <DataListField label="Saídas">{formatBRL(month.expense)}</DataListField>
            {month.projected ? null : <DataListField label="Lançamentos">{month.count}</DataListField>}
            {/* Sem este campo o mês em curso não fecha: a saída exibida soma o que já caiu
                com o que ainda vai cair, e a contagem de lançamentos cobre só a primeira
                parte. É ele que torna o número auditável. */}
            {month.partial && month.committed ? <DataListField label="Parcelas ainda a cair">{formatBRL(month.committed)}</DataListField> : null}
          </DataListItemFields>
          {parts.expense.length ? (
            <DataListItemFields>
              {parts.expense.map((part, i) => (
                <DataListField key={part.key} separator={i > 0} label={<SegmentLabel background={part.background}>{part.label}</SegmentLabel>}>
                  {formatBRL(part.value)}
                </DataListField>
              ))}
            </DataListItemFields>
          ) : null}
        </>
      )}
    </DataListItem>
  )
}

/** O quadradinho reproduz a MARCA que ele identifica: hachurado se a fatia é hachurada. */
function SegmentLabel({ background, children }: { background: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={SERIES_SWATCH} style={{ background }} />
      {children}
    </span>
  )
}

/**
 * O volume do mês repartido: entrada como bloco sólido, saída fatiada nas maiores
 * categorias. O denominador é entrada + saída, não a entrada — é por isso que a barra
 * responde "quanto do movimento foi o quê" e não "as saídas passaram das entradas?",
 * que é a leitura da porcentagem no cabeçalho.
 *
 * A cor de cada fatia sai de `categoryColor`, a mesma fonte dos gráficos: uma categoria
 * tem um matiz só no app inteiro.
 */
function splitVolume(income: number, expense: number, segments: ExpenseSegment[]): { total: number; income: SegmentPart | null; expense: SegmentPart[] } {
  return {
    total: income + expense,
    // Entrada sólida, saída hachurada: a mesma distinção do gráfico logo acima, então a
    // textura sozinha já diz de que lado do movimento a fatia é.
    income: income > 0 ? { key: '__entradas', label: 'Entradas', value: income, background: INCOME_VAR } : null,
    expense: splitExpense(segments, expense),
  }
}

function VolumeBar({ parts, month }: { parts: ReturnType<typeof splitVolume>; month: string }) {
  const { total, income, expense } = parts
  if (total <= 0) return <NotInformed>Sem movimento no mês</NotInformed>
  const all = income ? [income, ...expense] : expense
  const description = all.map((p) => `${p.label} ${formatBRL(p.value)}`).join(', ')
  return (
    // `role="img"` com a descrição inteira: as fatias são desenho, e um leitor de tela
    // precisa da leitura completa, não de doze retângulos sem nome.
    <span role="img" aria-label={`Movimento de ${month}: ${description}`} className="flex h-2 w-full gap-1 overflow-hidden rounded-xs">
      {all.map((part) => (
        <span key={part.key} className="h-full min-w-0.5 rounded-xs" style={{ width: `${(part.value / total) * 100}%`, background: part.background }} />
      ))}
    </span>
  )
}
