import { DataList, DataListField, DataListItem, DataListItemFields, DataListItemHeader } from '@/components/data-list/data-list'
import { SegmentLabel, VolumeBar } from '@/components/charts/volume-bar'
import { formatBRL, formatMonthLong, formatMonthLongLabel, formatPercent } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { splitVolume, type ExpenseSegment } from '@/lib/expense-segments'
import type { ForecastSources } from '@/lib/forecast'

export interface ForecastRow {
  month: string
  income: number
  expense: number
  net: number
  /** Saídas do mês por categoria, da maior para a menor. */
  segments: ExpenseSegment[]
  /** Mês que já tem extrato: aqui só entra o que ainda vence nele. */
  partial?: boolean
  /** De onde veio cada real da saída. Ausente no mês em curso, que não passa pela previsão cheia. */
  sources?: ForecastSources
}

/**
 * Os meses previstos, um item por mês.
 *
 * É a mesma lista da Visão geral, e de propósito: são os mesmos meses, lidos do mesmo jeito,
 * e a tabela de quatro colunas que estava aqui pedia do olho um alinhamento que a barra
 * resolve por comprimento. A diferença é que nenhum item abre gaveta — não há lançamento
 * para listar num mês que ainda não aconteceu.
 */
export function ForecastList({ rows }: { rows: ForecastRow[] }) {
  // Sem mês nenhum, a mensagem ENTRA NO LUGAR da lista. Uma lista não tem cabeçalho, então um
  // `<ul>` vazio não explica o que caberia nele — só ocupa espaço e faz o cartão parecer
  // quebrado. É a §3 da `data-list.md`, e diverge de propósito da tabela vazia, que fica.
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Nenhum mês à frente no período escolhido.</p>

  return (
    <DataList aria-label="Meses previstos">
      {rows.map((row) => (
        <ForecastItem key={row.month} row={row} />
      ))}
    </DataList>
  )
}

function ForecastItem({ row }: { row: ForecastRow }) {
  // Sem saída não há o que comparar: "0,0% das entradas" repetido em doze meses é ruído,
  // e nesta tela o mês só de entradas é o caso comum, não a exceção.
  const ratio = row.income > 0 && row.expense > 0 ? row.expense / row.income : null
  const parts = splitVolume(row.income, row.expense, row.segments)

  return (
    <DataListItem className="gap-2">
      <DataListItemHeader>
        <span className="flex items-center gap-1.5">
          {formatMonthLongLabel(row.month)}
          {/* O mês em curso não é previsão inteira: parte dele já está no extrato, e aqui
              só entra o que ainda vence. Sem a etiqueta, o número parece o mês todo. */}
          {row.partial ? <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Ainda a vencer</span> : null}
        </span>
        <span className="flex items-baseline gap-2">
          {ratio === null ? null : <span className={cn('font-normal text-muted-foreground tabular-nums', ratio > 1 && 'text-[var(--status-critical)]')}>{formatPercent(ratio, 1)} das entradas</span>}
          {/* Zero é neutro, não bom: só o positivo ganha cor. */}
          <span className={cn('tabular-nums', row.net < 0 && 'text-[var(--status-critical)]', row.net > 0 && 'text-[var(--status-good-text)]')}>{formatBRL(row.net)}</span>
        </span>
      </DataListItemHeader>

      {/* Toda linha desta tela é previsão, então a marca inteira vem contornada — e ela é mais
          alta que a barra medida da Visão geral por causa disso: um contorno de 1px em cima e
          outro embaixo come dois pixels, e num traço fino o vazio do meio deixa de se ler
          como vazio. Com `h-5` o tracejado da saída também tem altura para desenhar o traço
          nas laterais, não só em cima e embaixo. */}
      <VolumeBar parts={parts} label={`Previsão de ${formatMonthLong(row.month)}`} empty="Nada previsto no mês" projected className="h-5 rounded-sm [&>span]:rounded-sm" />
      <DataListItemFields>
        <DataListField label="Entradas" separator={false}>
          {formatBRL(row.income)}
        </DataListField>
        <DataListField label="Saídas">{formatBRL(row.expense)}</DataListField>
      </DataListItemFields>
      {parts.expense.length ? (
        <DataListItemFields>
          {parts.expense.map((part, i) => (
            <DataListField
              key={part.key}
              separator={i > 0}
              label={
                <SegmentLabel part={part} projected>
                  {part.label}
                </SegmentLabel>
              }
            >
              {formatBRL(part.value)}
            </DataListField>
          ))}
        </DataListItemFields>
      ) : null}
      {/* A origem de cada real da saída. É o que torna o total conferível: sem ela, quem
          compara com os lançamentos previstos vê um número maior e não sabe de onde veio. */}
      {row.sources ? (
        <DataListItemFields className="text-muted-foreground">
          <DataListField label="Declarado" separator={false}>
            {formatBRL(row.sources.declared)}
          </DataListField>
          <DataListField label="Contratado">{formatBRL(row.sources.committed)}</DataListField>
          {row.sources.plan === 0 ? null : <DataListField label="Planos">{formatBRL(row.sources.plan)}</DataListField>}
          <DataListField label="Rubricas">{formatBRL(row.sources.rubric)}</DataListField>
          {row.sources.offset === 0 ? null : <DataListField label="Abatido">{formatBRL(row.sources.offset)}</DataListField>}
        </DataListItemFields>
      ) : null}
    </DataListItem>
  )
}
