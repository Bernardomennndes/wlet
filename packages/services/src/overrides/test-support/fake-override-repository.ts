import type { Overrides } from '@wlet/domain'
import type { OverrideRepository } from '../domain/ports/override-repository'

/** Fake in-memory (§9). NÃO é código de produção. */
export function makeFakeOverrideRepository(initial: Overrides = {}): OverrideRepository & { snapshot(): Overrides } {
  let data: Overrides = { ...initial }
  return {
    async findAll() {
      return { ...data }
    },
    async save(next) {
      data = { ...next }
    },
    snapshot: () => ({ ...data }),
  }
}
