import { ArrowLeftRight, RotateCcw, SearchX } from 'lucide-react'
import { CategoryBadge } from '@/components/category-badge'
import { EntityBadge } from '@/components/entity-badge'
import { AppSelect } from '@/components/ui/app-select'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CATEGORIES, categoryLabel } from '@/data/categories'
import { useTransactionPaging, type TransactionPaging } from '@/hooks/use-transaction-paging'
import { ACCOUNT_MAP, type ViewTransaction } from '@/lib/finance'
import { formatDate, formatSigned } from '@/lib/format'
import { useFilters } from '@/providers/use-filters'
import { cn } from '@/lib/utils'

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c.id, label: c.label }))

/**
 * O rodapé é montado SEMPRE, esteja onde estiver: some-lo quando tudo cabe faz a altura
 * mudar a cada filtro, e a contagem é informação útil também na lista inteira e na vazia.
 */
export function TransactionTablePagination({ paging, className }: { paging: TransactionPaging; className?: string }) {
  return (
    <div className={cn('flex w-full items-center justify-between text-xs text-muted-foreground', className)}>
      <span>
        Mostrando {paging.shown} de {paging.total}
      </span>
      <Button variant="outline" onClick={paging.loadMore} disabled={!paging.hasMore}>
        Carregar mais
      </Button>
    </div>
  )
}

interface Props {
  rows: ViewTransaction[]
  compact?: boolean
  /**
   * Paginação vinda de fora, quando o rodapé é desenhado pelo pai. Sem ela a tabela cria a
   * própria e desenha o rodapé embaixo de si.
   */
  paging?: TransactionPaging
  /**
   * A tabela rola por dentro e o cabeçalho fica preso no topo. O scroll tem de ser do
   * contêiner do `Table` — ele já é `overflow-x-auto`, então é ELE o scrollport de um
   * `sticky`, e um pai rolando por fora deixaria o cabeçalho parado junto com a tabela.
   * Assume a superfície `popover` (o Sheet), a única onde isto é usado hoje.
   */
  scrollable?: boolean
}

export function TransactionTable({ rows, compact = false, paging: external, scrollable = false }: Props) {
  const { overrides, setOverride } = useFilters()
  const own = useTransactionPaging(rows)
  const paging = external ?? own
  const visible = rows.slice(0, paging.limit)

  return (
    <div className={cn('flex flex-col', scrollable && 'h-full min-h-0 [&>[data-slot=table-container]]:min-h-0 [&>[data-slot=table-container]]:flex-1 [&>[data-slot=table-container]]:overflow-y-auto')}>
      <Table className="min-w-[720px]">
        <TableHeader
          className={cn(
            scrollable &&
              // A linha do cabeçalho é sombra, não borda, e a borda da linha é DESLIGADA.
              // Com `border-collapse: collapse` a borda colapsada pertence à TABELA, não à
              // linha: quando o sticky desloca o `thead` ela fica para trás e o cabeçalho
              // flutua sem separação, mas no topo da rolagem ela pinta e soma com a sombra,
              // dando uma linha de 2px. A sombra viaja com o elemento e é a única aqui.
              'sticky top-0 z-10 bg-popover [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0',
          )}
        >
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            {!compact ? <TableHead>Conta</TableHead> : null}
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={compact ? 4 : 5}>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchX />
                    </EmptyMedia>
                    <EmptyTitle>Nenhuma transação com esses filtros.</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : null}
          {visible.map((tx) => {
            const account = ACCOUNT_MAP[tx.accountId]
            const current = overrides[tx.id] ?? tx.categoryId
            const overridden = overrides[tx.id] !== undefined
            const counterpart = tx.counterpartAccountId ? ACCOUNT_MAP[tx.counterpartAccountId] : null
            return (
              <TableRow key={tx.id} className="align-top">
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDate(tx.date)}
                  {tx.installment ? (
                    <span className="ml-1 text-[10px]">
                      {tx.installment.current}/{tx.installment.total}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{tx.merchant}</div>
                  {tx.description !== tx.merchant ? <div className="max-w-md truncate text-[11px] text-muted-foreground">{tx.description}</div> : null}
                  {tx.transferKind ? (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ArrowLeftRight className="size-3" aria-hidden />
                      {counterpart ? (
                        <span>
                          {tx.amount < 0 ? 'para' : 'de'} {counterpart.name}
                        </span>
                      ) : (
                        <span>transferência própria sem contraparte nos arquivos</span>
                      )}
                    </div>
                  ) : null}
                </TableCell>
                {!compact ? (
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {account?.name}
                      {account ? <EntityBadge entity={account.entity} /> : null}
                    </span>
                  </TableCell>
                ) : null}
                <TableCell>
                  <ButtonGroup>
                    <AppSelect
                      aria-label={`Categoria de ${tx.merchant}`}
                      value={current}
                      onValueChange={(next) => setOverride(tx.id, next === tx.categoryId ? null : next)}
                      items={CATEGORY_ITEMS}
                      modified={overridden}
                      className="w-52"
                    />
                    {overridden ? (
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="outline" size="icon" onClick={() => setOverride(tx.id, null)} aria-label="Voltar à categoria automática" />}>
                          <RotateCcw />
                        </TooltipTrigger>
                        <TooltipContent>Voltar à categoria automática ({categoryLabel(tx.categoryId)})</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </ButtonGroup>
                  {tx.displayCategoryId !== current ? <CategoryBadge value={tx.displayCategoryId} className="mt-1" /> : null}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums font-medium',
                    tx.flow === 'transfer' || tx.flow === 'reimbursement' ? 'text-muted-foreground' : tx.amount > 0 ? 'text-[var(--status-good-text)]' : '',
                  )}
                >
                  {formatSigned(tx.amount)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {external ? null : <TransactionTablePagination paging={paging} className="pt-3" />}
    </div>
  )
}
