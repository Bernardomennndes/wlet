import type { Account, DatasetMeta, Transaction, Transfer } from '@wlet/domain'
import type { Dataset } from '@wlet/domain'
import type { DatasetSeed } from '@wlet/services'

/**
 * O conjunto que veio no build — quando veio.
 *
 * Ele é lido só num navegador cujo IndexedDB está vazio, e por isso é OPCIONAL: `pnpm ingest`
 * pode nunca ter rodado, e apagar `src/generated/` não pode derrubar o app. Devolve `null`
 * nesse caso, e quem chama decide — o serviço abre com um conjunto vazio e a tela manda a
 * pessoa para "Meus dados".
 *
 * O `import()` é dinâmico e o módulo alvo usa `import.meta.glob`: as duas coisas juntas são o
 * que mantém o build possível sem os arquivos E o runner de testes, que roda fora do Vite,
 * capaz de importar esta cadeia.
 */
export function makeBundleSeed(): DatasetSeed {
  return {
    async read(): Promise<Dataset | null> {
      try {
        const { readGenerated } = await import('@/lib/generated-files')
        const [accounts, meta, transactions, transfers, investments] = await Promise.all([
          readGenerated<Account[]>('accounts'),
          readGenerated<DatasetMeta>('meta'),
          readGenerated<Transaction[]>('transactions'),
          readGenerated<Transfer[]>('transfers'),
          readGenerated<Dataset['investments']>('investments'),
        ])
        // Meia semente não é semente: um conjunto sem `meta` não tem meses, e sem meses as
        // telas não sabem o que desenhar. Ou vieram os cinco, ou não veio nada.
        if (!accounts || !meta || !transactions || !transfers || !investments) return null
        return { accounts, meta, transactions, transfers, investments }
      } catch {
        // Fora do Vite (runner de testes) `import.meta.glob` não existe. Sem semente é um
        // estado previsto, não uma falha.
        return null
      }
    },
  }
}
