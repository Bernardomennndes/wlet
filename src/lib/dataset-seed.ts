import type { Account, Budget, DatasetMeta, Goal, PlannedEntry, Receivable, Transaction, Transfer } from '@/data/types'
import type { Dataset } from './dataset'

/**
 * O dataset que veio no build, lido só quando o IndexedDB está vazio.
 *
 * Os `import()` são DINÂMICOS de propósito. Estáticos, os 4,1 MB de `src/generated/` entram
 * no chunk principal — é o que acontece hoje, e foi assim que um `dist/` chegou a carregar
 * 5.315 lançamentos reais dentro do JavaScript. Dinâmicos, o Vite os separa num chunk à
 * parte, que só é baixado no primeiro boot de um navegador sem banco; depois disso o app
 * lê do IndexedDB e a semente nunca mais é buscada.
 */
export async function loadSeed(): Promise<Dataset> {
  const [accounts, meta, transactions, transfers, planned, receivables, budget, goals, investments] = await Promise.all([
    import('@/generated/accounts.json'),
    import('@/generated/meta.json'),
    import('@/generated/transactions.json'),
    import('@/generated/transfers.json'),
    import('@/generated/planned.json'),
    import('@/generated/receivables.json'),
    import('@/generated/budget.json'),
    import('@/generated/goals.json'),
    import('@/generated/investments.json'),
  ])
  return {
    accounts: accounts.default as Account[],
    meta: meta.default as DatasetMeta,
    transactions: transactions.default as Transaction[],
    transfers: transfers.default as Transfer[],
    planned: planned.default as PlannedEntry[],
    receivables: receivables.default as Receivable[],
    budget: budget.default as Budget,
    goals: goals.default as Goal[],
    investments: investments.default as Dataset['investments'],
  }
}
