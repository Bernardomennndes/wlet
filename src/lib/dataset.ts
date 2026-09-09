import type { Account, Budget, DatasetMeta, Goal, IncomeMonth, InvestmentSnapshot, PatrimonyPoint, PlannedEntry, Receivable, Transaction, Transfer } from '@/data/types'

/**
 * O dataset inteiro, num lugar só — e o PORTÃO que separa carregá-lo de consumi-lo.
 *
 * Os módulos de `src/lib/` exportam CONSTANTES derivadas daqui (`TRANSACTIONS`, `PLANNED`,
 * `BUDGET`…), lidas por 25 arquivos. Enquanto o dado vinha de `import x from '*.json'`, essa
 * forma era gratuita: o bundler resolvia tudo antes do primeiro render. Vindo do IndexedDB,
 * que é assíncrono, ela deixaria de funcionar — e trocar as constantes por getters mudaria
 * os 25 consumidores.
 *
 * A saída é carregar ANTES: `main.tsx` preenche este módulo e só então importa o app, de
 * modo dinâmico. Quando `finance.ts` é avaliado, `dataset()` já tem o que devolver, e nada
 * rio abaixo precisa saber que a origem mudou. O preço é uma regra: **`main.tsx` não pode
 * importar nada de `src/lib/` estaticamente**, senão o módulo é avaliado antes do portão.
 */
export interface Dataset {
  accounts: Account[]
  meta: DatasetMeta
  transactions: Transaction[]
  transfers: Transfer[]
  planned: PlannedEntry[]
  receivables: Receivable[]
  budget: Budget
  goals: Goal[]
  investments: { snapshot: InvestmentSnapshot | null; series: PatrimonyPoint[]; income: IncomeMonth[] }
}

let current: Dataset | null = null

export function setDataset(next: Dataset): void {
  current = next
}

/**
 * Lança em vez de devolver vazio. Um dataset ausente é erro de ORDEM DE BOOT, não estado
 * possível do app — e devolvido como `[]` ele viraria uma tela em branco plausível, que é o
 * pior jeito de descobrir o problema.
 */
export function dataset(): Dataset {
  if (!current) {
    throw new Error('dataset() foi chamado antes do boot. Algum módulo de src/lib/ foi importado estaticamente por main.tsx — veja a regra em src/lib/dataset.ts.')
  }
  return current
}

export function hasDataset(): boolean {
  return current !== null
}
