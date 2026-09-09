import type { Budget, Goal, PlannedEntry, Receivable } from '@/data/types'
import type { Declarations } from '@/lib/ingest/pipeline'
import type { ConfigSeed } from '../domain/ports/config-repository'

/**
 * As declarações que vieram no build — a semente da primeira abertura.
 *
 * Ela lê os JSON que `pnpm ingest` gravou. Repare que o app NÃO os consome mais em tempo de
 * execução: eles existem só para um navegador vazio ter de onde partir. É por isso que o
 * `import()` é dinâmico — sem consumidor no caminho crítico, o Vite os separa num chunk que só
 * é buscado no primeiro boot.
 *
 * `accounts`, `rules` e `selfNames` nascem VAZIOS, e isso não é lacuna: é o que o pipeline
 * espera de quem não configurou nada. Sem perfil, ele CRIA a conta a partir dos metadados do
 * arquivo e avisa no relatório; sem regra sua, valem as genéricas, que estão no código; sem
 * nome próprio, nenhuma transferência é reconhecida como sua — e inventar um nome casaria a
 * transferência de outra pessoa.
 */
export function makeBundleDeclarations(): ConfigSeed {
  return {
    async read(): Promise<Declarations> {
      const [planned, receivables, budget, goals] = await Promise.all([
        import('@/generated/planned.json'),
        import('@/generated/receivables.json'),
        import('@/generated/budget.json'),
        import('@/generated/goals.json'),
      ])
      return {
        planned: planned.default as PlannedEntry[],
        receivables: receivables.default as Receivable[],
        budget: budget.default as Budget,
        goals: goals.default as Goal[],
        trips: [],
        accounts: [],
        rules: [],
        selfNamePatterns: [],
        tripExcludedCategories: [],
      }
    },
  }
}
