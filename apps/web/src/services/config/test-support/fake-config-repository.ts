import type { ConfigData, ConfigRepository, ConfigSeed } from '../domain/ports/config-repository'

/** Fakes in-memory (§9). NÃO é código de produção. */
export function makeFakeConfigRepository(initial: ConfigData | null = null): ConfigRepository & { snapshot(): ConfigData | null; saves: number } {
  let data = initial ? structuredClone(initial) : null
  const state = {
    saves: 0,
    async find() {
      return data ? structuredClone(data) : null
    },
    async save(next: ConfigData) {
      data = structuredClone(next)
      state.saves += 1
    },
    snapshot: () => (data ? structuredClone(data) : null),
  }
  return state
}

export function makeFakeSeed(data: ConfigData | null): ConfigSeed {
  return { read: async () => (data ? structuredClone(data) : null) }
}

/** Uma configuração mínima e VÁLIDA, para o teste partir de algo que passa na validação. */
export function seedConfig(): ConfigData {
  return {
    planned: [{ id: 'aluguel', kind: 'expense', label: 'Aluguel', amount: 1500, categoryId: 'moradia', entity: 'PF', recurrence: 'monthly', startMonth: '2026-01' }],
    budget: { monthlyLimit: 9000, warnAt: 0.75, byCategory: [{ categoryId: 'mercado', amount: 900 }] },
    receivables: [],
    goals: [],
    accounts: [],
    rules: [],
    selfNamePatterns: [],
  }
}
