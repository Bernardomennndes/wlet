import type { EnvelopeSpec } from '../../shared/envelope'
import { makeIndexedDbDriver } from '../../shared/infrastructure/indexed-db.driver'
import type { ConfigData, ConfigRepository } from '../domain/ports/config-repository'

/**
 * A configuração declarada em IndexedDB.
 *
 * **Por que IndexedDB e não `localStorage`** (§7): não é o tamanho — os cinco configs somam
 * ordem de KB e caberiam. É a FORMA. Quando `accounts` e `rules` entrarem aqui, eles trazem 29
 * `RegExp`, e `JSON.stringify(/x/i)` devolve `{}` sem erro nenhum: a categorização inteira
 * ficaria sem regra e nada avisaria. IndexedDB guarda por *structured clone*, que preserva
 * expressão regular. Escolher agora o armazenamento que aguenta os sete evita migrar de novo
 * quando os outros dois chegarem.
 *
 * `version: 1` porque esta configuração nunca foi gravada em navegador nenhum — ao contrário
 * dos planos, aqui não há nada instalado para preservar.
 */
const VERSION = 1

const spec: EnvelopeSpec<ConfigData | null> = {
  version: VERSION,
  // `null`, e não um objeto em branco: "não há config gravada" precisa ser distinguível de
  // "há uma config que declara nada". O serviço usa essa diferença para decidir semear.
  empty: () => null,
  parse: (raw) => {
    if (!raw || typeof raw !== 'object') return null
    const c = raw as Partial<ConfigData>
    if (!Array.isArray(c.planned) || !Array.isArray(c.receivables) || !Array.isArray(c.goals) || !c.budget) return null
    if (!Array.isArray(c.accounts) || !Array.isArray(c.rules) || !Array.isArray(c.selfNamePatterns)) return null
    // `rules` e `selfNamePatterns` voltam do structured clone como RegExp de verdade. Se
    // voltassem como objeto vazio — o que aconteceria por JSON —, a categorização inteira
    // silenciaria, então a conferência é pelo TIPO e não só pela presença.
    if (!c.selfNamePatterns.every((r) => r instanceof RegExp)) return null
    return {
      planned: c.planned,
      budget: c.budget,
      receivables: c.receivables,
      goals: c.goals,
      accounts: c.accounts,
      rules: c.rules,
      selfNamePatterns: c.selfNamePatterns,
    }
  },
}

export function makeIndexedDbConfigRepository(): ConfigRepository {
  const driver = makeIndexedDbDriver('config', 'declared', spec)
  return {
    find: () => driver.read(),
    save: (data) => driver.write(data),
  }
}
