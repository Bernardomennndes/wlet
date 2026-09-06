import { Link } from 'react-router'
import { CategoryBadge } from '@/components/category-badge'
import { EnumBadge } from '@/components/enum-badge'
import { NotInformed } from '@/components/not-informed'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { forecastOrigins, type ForecastItem } from '@/lib/forecast'
import { formatBRL, formatDayMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Fora do render: a busca na lista não depende de nenhuma prop. */
const ORIGINS = new Map(forecastOrigins.map((option) => [option.value, option]))

/**
 * Para onde o item leva, e é a ORIGEM que decide — porque só uma delas tem transação.
 *
 * Parcela contratada veio de uma compra que está no extrato: o destino é a busca por
 * estabelecimento, que traz a compra e todas as parcelas dela de uma vez. As outras três não
 * têm lançamento nenhum por trás — são declaração —, então levam a quem as declara: a conta a
 * pagar e a receita prevista às telas que as governam, a rubrica ao histórico da categoria
 * (é o único jeito de responder "quanto eu costumo gastar disso?") e o abatimento à cobrança.
 *
 * Mora aqui e não em `forecast.ts`: montar URL é assunto de tela, e a lib não conhece rota.
 */
function linkOf(item: ForecastItem): { to: string; title: string } {
  switch (item.origin) {
    case 'committed':
      // A busca casa contra estabelecimento, descrição e descrição crua — ver a tela de
      // Transações. O estabelecimento é o que o ingest normalizou, então ele casa sempre.
      return { to: `/transacoes?q=${encodeURIComponent(item.label)}`, title: `Ver os lançamentos de ${item.label}` }
    case 'rubric':
      return { to: `/transacoes?categoria=${encodeURIComponent(item.categoryId)}`, title: 'Ver o histórico de gasto desta categoria' }
    case 'offset':
      return { to: '/cobrancas', title: 'Ver a cobrança que gera este abatimento' }
    default:
      return item.amount < 0 ? { to: '/pagamentos', title: 'Ver a conta a pagar que declara isto' } : { to: '/previsao', title: 'Ver a regra que declara isto' }
  }
}

/**
 * O que vai acontecer num mês, item a item.
 *
 * É tabela, e pela §0 da regra de data-table: as colunas são homogêneas e a leitura é varrer
 * — "o que cai no dia 25?", "quanto disso é chute?". A gaveta de um mês MEDIDO mostra a
 * `TransactionTable`; esta é a gêmea dela do lado do futuro, e as duas se leem igual de
 * propósito, porque respondem a mesma pergunta em tempos diferentes.
 */
export function ForecastAgenda({ items, className }: { items: ForecastItem[]; className?: string }) {
  if (items.length === 0) {
    return (
      <div className="p-6">
        <NotInformed>Nada previsto para este mês</NotInformed>
      </div>
    )
  }
  return (
    <div className={cn('overflow-x-auto', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Quando</TableHead>
            <TableHead>O quê</TableHead>
            <TableHead className="w-44">Categoria</TableHead>
            <TableHead className="w-32">Origem</TableHead>
            <TableHead className="w-32 text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const link = linkOf(item)
            return (
              <TableRow key={item.key}>
                {/* Sem dia é o normal em duas origens, não uma falha do dado: parcela cai na
                  fatura, cuja data depende do fechamento, e rubrica não tem dia nenhum. */}
                <TableCell className="whitespace-nowrap tabular-nums">{item.date ? formatDayMonth(item.date) : <NotInformed>No mês</NotInformed>}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {/* Âncora de verdade, e só no rótulo: a linha inteira clicável precisaria de
                    um alvo focável assim mesmo, e aqui o alvo já é o texto que nomeia o item. */}
                  <Link to={link.to} title={link.title} className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40">
                    {item.label}
                  </Link>
                  {item.installment ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · parcela {item.installment.current} de {item.installment.total}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <CategoryBadge value={item.categoryId} />
                </TableCell>
                <TableCell>
                  <EnumBadge option={ORIGINS.get(item.origin)} value={item.origin} />
                </TableCell>
                <TableCell className={cn('whitespace-nowrap text-right font-medium tabular-nums', item.amount > 0 && 'text-[var(--status-good-text)]')}>
                  {item.amount > 0 ? `+ ${formatBRL(item.amount)}` : `− ${formatBRL(Math.abs(item.amount))}`}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
