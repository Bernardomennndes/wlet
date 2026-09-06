import { EnumBadge } from '@/components/enum-badge'
import { payableStatuses, receivableStatuses } from '@/data/types'
import { formatBRL, formatMonthShort } from '@/lib/format'
import type { Settlement } from '@/lib/settlement'

/**
 * O histórico de uma regra conciliada, um mês por linha — serve cobrança e conta a pagar.
 *
 * É tabela e não lista pela §0 da regra de data-table, ao contrário das telas em volta: aqui
 * as colunas são homogêneas e a leitura é varrer procurando o mês que destoa. "Quando ele
 * pagou menos?" se responde por alinhamento.
 *
 * Sem `<Table>` do registry: dentro de um item de lista, a moldura e o cabeçalho dele
 * duplicariam as bordas do item. O que se aproveita é a grade alinhada.
 *
 * As duas telas usavam gêmeas com 85% de código igual. O que de fato difere são quatro
 * coisas, e elas viraram parâmetro: o substantivo do estado, o rótulo do que entrou, o lado
 * da diferença que merece atenção, e a coluna de quem cumpriu — que só a cobrança tem.
 */
const KINDS = {
  receivable: { options: receivableStatuses, actualLabel: 'Recebido', worrying: 'below' },
  payable: { options: payableStatuses, actualLabel: 'Pago', worrying: 'above' },
} as const

export type SettlementKind = keyof typeof KINDS

export function SettlementHistory({
  occurrences,
  kind,
  counterpart,
}: {
  occurrences: Settlement[]
  kind: SettlementKind
  /**
   * A coluna "quem cumpriu". `ignore` é quem se espera — só quem NÃO é ele aparece, porque
   * repetir o nome do titular em oito linhas esconde justamente o mês em que outro pagou.
   */
  counterpart?: { label: string; ignore: string }
}) {
  if (occurrences.length === 0) return null
  const { options, actualLabel, worrying } = KINDS[kind]
  const badge = new Map(options.map((option) => [option.value, option]))

  return (
    <table className="w-full text-xs tabular-nums">
      <caption className="sr-only">Histórico mês a mês</caption>
      <thead className="text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="py-1 text-left font-normal">
            Mês
          </th>
          <th scope="col" className="py-1 text-right font-normal">
            Esperado
          </th>
          <th scope="col" className="py-1 text-right font-normal">
            {actualLabel}
          </th>
          <th scope="col" className="py-1 text-right font-normal">
            Diferença
          </th>
          {counterpart ? (
            <th scope="col" className="py-1 text-right font-normal">
              {counterpart.label}
            </th>
          ) : null}
          <th scope="col" className="py-1 text-right font-normal">
            Situação
          </th>
        </tr>
      </thead>
      <tbody>
        {occurrences.map((occurrence) => {
          const difference = occurrence.actual - occurrence.expected
          // Numa despesa, pagar MAIS que o esperado é o que merece atenção; numa cobrança,
          // receber menos. É o mesmo número lido de dois lados.
          const critical = worrying === 'above' ? difference > 0 : difference < 0
          const others = counterpart ? occurrence.counterparts.filter((who) => who !== counterpart.ignore) : []
          return (
            <tr key={occurrence.month} className="border-b last:border-b-0">
              <td className="py-1">{formatMonthShort(occurrence.month)}</td>
              <td className="py-1 text-right text-muted-foreground">{formatBRL(occurrence.expected)}</td>
              <td className="py-1 text-right font-medium">{formatBRL(occurrence.actual)}</td>
              {/* Zero não ganha cor: cumprir exatamente o combinado é o normal, não um feito. */}
              <td className={critical ? 'py-1 text-right text-[var(--status-critical)]' : 'py-1 text-right text-muted-foreground'}>{difference === 0 ? '—' : formatBRL(difference)}</td>
              {counterpart ? <td className="max-w-[10rem] truncate py-1 text-right text-muted-foreground">{others.join(', ')}</td> : null}
              <td className="py-1 text-right">
                <EnumBadge option={badge.get(occurrence.status)} value={occurrence.status} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
