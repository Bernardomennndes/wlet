import { useState } from 'react'
import type { ViewTransaction } from '@/lib/finance'

/** Quantos lançamentos entram por vez. */
const PAGE = 50

export interface TransactionPaging {
  limit: number
  shown: number
  total: number
  hasMore: boolean
  loadMore: () => void
}

/**
 * O estado de paginação da tabela de transações, fora dela.
 *
 * Existe para quem precisa desenhar o rodapé em outro lugar — o rodapé de um sheet, por
 * exemplo. Sem isto, mover o rodapé exigiria duplicar o `limit` no pai e mantê-lo em
 * sincronia com o da tabela, que é estado espelhado.
 */
export function useTransactionPaging(rows: ViewTransaction[]): TransactionPaging {
  const [limit, setLimit] = useState(PAGE)
  return {
    limit,
    shown: Math.min(limit, rows.length),
    total: rows.length,
    hasMore: rows.length > limit,
    loadMore: () => setLimit((l) => l + PAGE),
  }
}
