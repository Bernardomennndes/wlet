import type { Account, DatasetMeta, IncomeMonth, InvestmentSnapshot, PatrimonyPoint, Transaction, Transfer } from './types'

/**
 * A FORMA do conjunto medido, separada do PORTÃO que o carrega.
 *
 * O portão (`dataset()`, `setDataset`) é do app: ele existe porque a SPA precisa de leitura
 * síncrona depois de um boot assíncrono. Já a forma é vocabulário — o servidor a produz, o
 * contrato a declara e os serviços a guardam, e nenhum dos três tem portão nenhum.
 */
export interface Dataset {
  accounts: Account[]
  meta: DatasetMeta
  transactions: Transaction[]
  transfers: Transfer[]
  investments: { snapshot: InvestmentSnapshot | null; series: PatrimonyPoint[]; income: IncomeMonth[] }
}

export function emptyDataset(): Dataset {
  return {
    accounts: [],
    meta: { generatedAt: new Date().toISOString(), sourceFiles: [], totals: { transactions: 0, transfers: 0, accounts: 0 }, months: [] },
    transactions: [],
    transfers: [],
    investments: { snapshot: null, series: [], income: [] },
  }
}
