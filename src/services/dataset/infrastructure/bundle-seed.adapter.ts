import type { Account, DatasetMeta, Transaction, Transfer } from '@/data/types'
import type { Dataset } from '@/lib/dataset'
import type { DatasetSeed } from '../domain/ports/dataset-repository'

/**
 * O dataset que veio no build, lido só quando o IndexedDB está vazio.
 *
 * Os `import()` são DINÂMICOS de propósito. Estáticos, os 4,1 MB de `src/generated/` entram
 * no chunk principal — é o que acontece hoje, e foi assim que um `dist/` chegou a carregar
 * 5.315 lançamentos reais dentro do JavaScript. Dinâmicos, o Vite os separa num chunk à
 * parte, que só é baixado no primeiro boot de um navegador sem banco; depois disso o app
 * lê do IndexedDB e a semente nunca mais é buscada.
 */
async function loadSeed(): Promise<Dataset> {
  const [accounts, meta, transactions, transfers, investments] = await Promise.all([
    import('@/generated/accounts.json'),
    import('@/generated/meta.json'),
    import('@/generated/transactions.json'),
    import('@/generated/transfers.json'),
    import('@/generated/investments.json'),
  ])
  return {
    accounts: accounts.default as Account[],
    meta: meta.default as DatasetMeta,
    transactions: transactions.default as Transaction[],
    transfers: transfers.default as Transfer[],
    investments: investments.default as Dataset['investments'],
  }
}

/** A semente como porta do contexto — é isto que o serviço recebe. */
export function makeBundleSeed(): DatasetSeed {
  return { read: loadSeed }
}
