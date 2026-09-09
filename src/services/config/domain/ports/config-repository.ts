import type { Budget, Goal, PlannedEntry, Receivable, Trip } from '@/data/types'

/**
 * A configuração declarada: o que o ingest lê para projetar, cobrar e medir.
 *
 * São CINCO, e não sete. `accounts` e `rules` — os dois que carregam `RegExp` — ficam de fora
 * por enquanto porque seus tipos (`AccountProfile`, `CategoryRule`) só existem em `scripts/`, e
 * a §8 proíbe redeclarar tipo de domínio dentro do serviço. Eles entram quando os tipos
 * mudarem para `src/data/types.ts`, o que é passo do porte do ingest, não desta camada.
 */
export interface ConfigData {
  planned: PlannedEntry[]
  budget: Budget
  receivables: Receivable[]
  goals: Goal[]
  trips: Trip[]
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
