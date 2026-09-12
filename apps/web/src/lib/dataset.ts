import type { Declarations } from '@wlet/ingest/pipeline'
import type { Dataset } from '@wlet/domain'

/**
 * O que o app carrega antes de existir — e o PORTÃO que separa carregar de consumir.
 *
 * Os módulos de `src/lib/` exportam CONSTANTES derivadas daqui (`TRANSACTIONS`, `PLANNED`,
 * `BUDGET`…), lidas por 25 arquivos. Enquanto o dado vinha de `import x from '*.json'`, essa
 * forma era gratuita: o bundler resolvia tudo antes do primeiro render. Vindo da rede, que é
 * assíncrona, ela deixaria de funcionar — e trocar as constantes por getters mudaria os 25
 * consumidores.
 *
 * A saída é carregar ANTES: `main.tsx` preenche este módulo e só então importa o app, de modo
 * dinâmico. Quando `finance.ts` é avaliado, `dataset()` já tem o que devolver, e nada rio
 * abaixo precisa saber que a origem mudou. O preço é uma regra: **`main.tsx` não pode importar
 * nada de `src/lib/` que LEIA isto**, senão o módulo é avaliado antes do portão.
 */

export type { Dataset } from '@wlet/domain'
export { emptyDataset } from '@wlet/domain'
/**
 * O que foi DECLARADO: o que você disse ao app.
 *
 * Mesma forma que o pipeline recebe, porque é a mesma coisa — e é essa identidade que impede as
 * duas de divergirem.
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

/**
 * O conjunto de quem ainda não tem conjunto nenhum.
 *
 * Não é o mesmo que ausência: `dataset()` continua LANÇANDO quando é chamado antes do boot,
 * porque aquilo é erro de ordem e precisa aparecer. Isto aqui é um estado legítimo do app —
 * `pnpm ingest` nunca rodou, `src/generated/` não veio no build, e o navegador está vazio.
 * Antes ele não existia: o app prometia que os dados vêm do navegador e mesmo assim o build
 * exigia os JSON gerados, então apagar `src/generated/` derrubava a compilação inteira.
 *
 * `months` vazio é o que as telas consultam para saber que não há o que desenhar, e por isso
 * `finance.ts` precisa aguentá-lo — ver `lastMonthWithData`.
 */
