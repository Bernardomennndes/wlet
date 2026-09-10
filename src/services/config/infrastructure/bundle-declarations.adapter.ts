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
 * E é por isso que a leitura passa por `readGenerated`, e não por `import('@/generated/x.json')`
 * direto: o segundo é resolvido em tempo de BUILD, então a semente — que deveria ser opcional —
 * fazia o projeto inteiro deixar de compilar quando `src/generated/` não existia. Sem os
 * arquivos ela devolve `null`, e o serviço abre com a configuração vazia.
 *
 * `accounts`, `rules` e `selfNames` nascem VAZIOS, e isso não é lacuna: é o que o pipeline
 * espera de quem não configurou nada. Sem perfil, ele CRIA a conta a partir dos metadados do
 * arquivo e avisa no relatório; sem regra sua, valem as genéricas, que estão no código; sem
 * nome próprio, nenhuma transferência é reconhecida como sua — e inventar um nome casaria a
 * transferência de outra pessoa.
 */
export function makeBundleDeclarations(): ConfigSeed {
  return {
    async read(): Promise<Declarations | null> {
      try {
        const { readGenerated } = await import('@/lib/generated-files')
        const [planned, receivables, budget, goals] = await Promise.all([
          readGenerated<PlannedEntry[]>('planned'),
          readGenerated<Receivable[]>('receivables'),
          readGenerated<Budget>('budget'),
          readGenerated<Goal[]>('goals'),
        ])
        if (!planned || !receivables || !budget || !goals) return null
        return { planned, receivables, budget, goals, accounts: [], rules: [], selfNamePatterns: [] }
      } catch {
        // Fora do Vite (runner de testes) `import.meta.glob` não existe.
        return null
      }
    },
  }
}
