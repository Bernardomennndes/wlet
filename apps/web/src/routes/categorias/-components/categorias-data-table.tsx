import { useState } from 'react'
import { MagnifyingGlassMinus } from '@phosphor-icons/react'
import { CategoryBadge } from '@/components/category-badge'
import { Button } from '@wlet/ui/components/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@wlet/ui/components/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wlet/ui/components/table'
import type { Recurring } from '@/lib/finance'
import { formatBRL, formatDate } from '@wlet/lib/format'
import { VariabilityBadge } from './variability-badge'

/**
 * A tabela de "Cobranças recorrentes" da rota, isolada do `-content.tsx`.
 *
 * As linhas chegam por prop em vez de serem buscadas aqui: neste projeto não há loader
 * nem query — o recorte vem do `useFilters`, que a PÁGINA já lê para alimentar gráfico,
 * ranking e detalhe. Duplicar essa leitura aqui não economizaria nada e faria a tabela
 * recalcular `detectRecurring` por conta própria. O que é estado de VISUALIZAÇÃO — o
 * limite de linhas — esse sim mora aqui dentro.
 */

/** Quantas contrapartes recorrentes entram por vez. */
const RECURRING_PAGE = 20

interface Props {
  rows: Recurring[]
  /** Total de meses do período, denominador da coluna "Meses". */
  monthsInPeriod: number
}

export function CategoriasDataTable({ rows, monthsInPeriod }: Props) {
  const [limit, setLimit] = useState(RECURRING_PAGE)
  const visible = rows.slice(0, limit)
  const hasMore = rows.length > limit

  return (
    <div className="flex flex-col">
      {/* Seis colunas numa coluna estreita do grid: o padding padrão de célula
          (p-2) somaria ~96px e jogaria "Último" para fora do cartão. */}
      <Table className="min-w-[560px] [&_:is(th,td)]:px-1.5">
        <TableHeader>
          <TableRow>
            <TableHead>Contraparte</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Meses</TableHead>
            <TableHead className="text-right">Média/mês</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Último</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {visible.map((r) => (
            <TableRow key={r.merchant}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="max-w-44 truncate" title={r.merchant}>
                    {r.merchant}
                  </span>
                  <VariabilityBadge variability={r.variability} />
                </span>
              </TableCell>
              <TableCell className="max-w-40 truncate">
                <CategoryBadge value={r.categoryId} />
              </TableCell>
              <TableCell className="text-right">
                {r.months.length}/{monthsInPeriod}
              </TableCell>
              <TableCell className="text-right">{formatBRL(r.monthlyAverage)}</TableCell>
              <TableCell className="text-right font-medium">{formatBRL(r.total)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{formatDate(r.lastDate)}</TableCell>
            </TableRow>
          ))}
          {/* Estado vazio DENTRO da tabela: o cabeçalho é o que explica o que a listagem contém. */}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MagnifyingGlassMinus />
                    </EmptyMedia>
                    <EmptyTitle>Nenhuma contraparte se repete em três ou mais meses no recorte e no período selecionados.</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {/* Mesmo rodapé da tabela de transações, e montado SEMPRE pelo mesmo motivo: some-lo
          quando tudo cabe faz a altura mudar a cada filtro, e a contagem é informação útil
          também na lista inteira e na vazia. Antes o corte em 20 era mudo — a 21ª assinatura,
          justamente a esquecida que esta tela existe para achar, não tinha como ser vista. */}
      <div className="flex w-full items-center justify-between pt-3 text-xs text-muted-foreground">
        <span>
          Mostrando {visible.length} de {rows.length}
        </span>
        <Button variant="outline" onClick={() => setLimit((l) => l + RECURRING_PAGE)} disabled={!hasMore}>
          Carregar mais
        </Button>
      </div>
    </div>
  )
}
