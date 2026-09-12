import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { NotInformed } from '@/components/not-informed'
import { SegmentLabel, VolumeBar } from '@/components/charts/volume-bar'
import { formatBRL, formatMonthLong, formatMonthLongLabel, formatPercent } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { splitVolume, type ExpenseSegment } from '@/lib/expense-segments'
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
  // Sem mês nenhum, a mensagem ENTRA NO LUGAR da lista. Uma lista não tem cabeçalho, então um
  // `<ul>` vazio não explica o que caberia nele — só ocupa espaço enquanto o cartão promete
  // "clique num mês" sobre nada. É a §3 da `data-list.md`, e diverge de propósito da tabela
  // vazia, que fica. A guarda mora aqui, e não no call site, porque é este componente que
  // sabe que a forma é lista.
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Nenhum mês no período escolhido.</p>

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
  const toggle = () => onSelect(open ? '' : month.month)
  const ratio = month.income > 0 ? month.expense / month.income : null
  const parts = splitVolume(month.income, month.expense, segments)

  return (
    // Todo mês abre: o medido mostra os lançamentos, o previsto mostra a agenda do que vai
    // acontecer. O previsto era barrado quando não havia o que mostrar nele.
    <DataListItem selected={open} onClick={toggle} className={cn('gap-2 cursor-pointer', month.projected && 'text-muted-foreground')}>
      <DataListItemHeader>
        <span className="flex items-center gap-1.5">
          {/* Botão real: a linha inteira responde ao mouse, mas o teclado precisa de um
              alvo focável. O que ele abre é um DIÁLOGO, então o anúncio correto é
              `haspopup`: `aria-controls` apontaria para um id que só existe enquanto o
              sheet está montado, e `aria-expanded` descreve conteúdo que se revela na
              própria página. */}
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
          {/* Sem badge, por decisão de layout: o que marca o mês previsto é a barra oca.
              Contorno não existe para leitor de tela, então a palavra fica em `sr-only` —
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
          {/* A descrição do leitor de tela é frase, então o mês vai em minúscula ali.
              A altura é a mesma nas linhas medidas e nas previstas — a barra existe para
              comparar meses, e comparar comprimentos de alturas diferentes não funciona. */}
          <VolumeBar parts={parts} label={`Movimento de ${formatMonthLong(month.month)}`} projected={month.projected} className="h-5 rounded-sm [&>span]:rounded-sm" />
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
            {/* Mesma razão do campo acima, do outro lado do movimento: a entrada exibida
                soma o que já caiu com o que ainda vence, e a contagem de lançamentos cobre
                só a primeira parte. */}
            {month.partial && month.plannedIncome ? <DataListField label="Entradas ainda a receber">{formatBRL(month.plannedIncome)}</DataListField> : null}
            {month.partial && month.plannedExpense ? <DataListField label="Saídas ainda a vencer">{formatBRL(month.plannedExpense)}</DataListField> : null}
          </DataListItemFields>
          {parts.expense.length ? (
            <DataListItemFields>
              {parts.expense.map((part, i) => (
                <DataListField
                  key={part.key}
                  separator={i > 0}
                  label={
                    <SegmentLabel part={part} projected={month.projected}>
                      {part.label}
                    </SegmentLabel>
                  }
                >
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
