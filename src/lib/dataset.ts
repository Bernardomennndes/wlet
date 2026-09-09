import type { Account, DatasetMeta, IncomeMonth, InvestmentSnapshot, PatrimonyPoint, Transaction, Transfer } from '@/data/types'
import type { Declarations } from '@/lib/ingest/pipeline'

/**
 * O que o app carrega antes de existir — e o PORTÃO que separa carregar de consumir.
 *
 * Os módulos de `src/lib/` exportam CONSTANTES derivadas daqui (`TRANSACTIONS`, `PLANNED`,
 * `BUDGET`…), lidas por 25 arquivos. Enquanto o dado vinha de `import x from '*.json'`, essa
 * forma era gratuita: o bundler resolvia tudo antes do primeiro render. Vindo do IndexedDB,
 * que é assíncrono, ela deixaria de funcionar — e trocar as constantes por getters mudaria os
 * 25 consumidores.
 *
 * A saída é carregar ANTES: `main.tsx` preenche este módulo e só então importa o app, de modo
 * dinâmico. Quando `finance.ts` é avaliado, `dataset()` já tem o que devolver, e nada rio
 * abaixo precisa saber que a origem mudou. O preço é uma regra: **`main.tsx` não pode importar
 * nada de `src/lib/` que LEIA isto**, senão o módulo é avaliado antes do portão.
 */

/**
 * O que foi MEDIDO: o que os extratos disseram, depois de passar pelo pipeline.
 *
 * São cinco partes, e não nove. As declarações — previsões, cobranças, teto, metas — saíram
 * daqui: elas voltavam do pipeline e o app as lia do conjunto, o que criava DUAS cópias do
 * mesmo dado e fazia editar a configuração não mudar tela nenhuma até reingerir.
 */
export interface Dataset {
  accounts: Account[]
  meta: DatasetMeta
  transactions: Transaction[]
  transfers: Transfer[]
  investments: { snapshot: InvestmentSnapshot | null; series: PatrimonyPoint[]; income: IncomeMonth[] }
}

/**
 * O que foi DECLARADO: o que você disse ao app.
 *
 * Mesma forma que o pipeline recebe (`Declarations`, no kernel), porque é a mesma coisa — e é
 * essa identidade que impede as duas de divergirem.
 */
export type { Declarations }

let currentDataset: Dataset | null = null
let currentDeclarations: Declarations | null = null

export function setDataset(next: Dataset): void {
  currentDataset = next
}

export function setDeclarations(next: Declarations): void {
  currentDeclarations = next
}

/**
 * Lança em vez de devolver vazio. Um dado ausente aqui é erro de ORDEM DE BOOT, não estado
 * possível do app — e devolvido como `[]` ele viraria uma tela em branco plausível, que é o
 * pior jeito de descobrir o problema.
 */
export function dataset(): Dataset {
  if (!currentDataset) {
    throw new Error('dataset() foi chamado antes do boot. Algum módulo de src/lib/ foi importado estaticamente por main.tsx — veja a regra em src/lib/dataset.ts.')
  }
  return currentDataset
}

export function declarations(): Declarations {
  if (!currentDeclarations) {
    throw new Error('declarations() foi chamado antes do boot. Algum módulo de src/lib/ foi importado estaticamente por main.tsx — veja a regra em src/lib/dataset.ts.')
  }
  return currentDeclarations
}

export function hasDataset(): boolean {
  return currentDataset !== null
}
