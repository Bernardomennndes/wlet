import type { Budget, Goal, PlannedEntry, Receivable, Trip } from '@/data/types'
import type { AccountProfile } from '@/lib/ingest/pipeline'
import type { Rule } from '@/lib/ingest/rules'

/**
 * A configuração declarada: o que o ingest lê para identificar, categorizar, projetar e cobrar.
 *
 * São os SETE. `accounts`, `rules` e `selfNames` entraram quando o porte do pipeline trouxe
 * `AccountProfile` e `Rule` para `src/lib/ingest/` — antes disso os tipos só existiam em
 * `scripts/`, e a §8 proíbe redeclarar tipo de domínio dentro de um serviço.
 *
 * São eles que obrigam este contexto a viver em IndexedDB e não em `localStorage` (§7): as
 * regras carregam dezenas de `RegExp`, e `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum.
 */
export interface ConfigData {
  planned: PlannedEntry[]
  budget: Budget
  receivables: Receivable[]
  goals: Goal[]
  trips: Trip[]
  /** Como reconhecer a conta a partir do arquivo. */
  accounts: AccountProfile[]
  /** As SUAS regras de categorização, que rodam antes das genéricas. */
  rules: Rule[]
  /** Os nomes que identificam você numa descrição de transferência. */
  selfNames: RegExp[]
}

export interface ConfigRepository {
  find(): Promise<ConfigData | null>
  save(data: ConfigData): Promise<void>
}

/**
 * De onde sai a configuração na primeira abertura.
 *
 * É PORTA, e não import do contexto de dataset, por causa da §4: o `config` não pode conhecer
 * as classes internas de quem gerou o JSON. Quem monta o serviço decide se a semente vem do
 * bundle, de um arquivo importado ou de nada.
 */
export interface ConfigSeed {
  read(): Promise<ConfigData | null>
}
