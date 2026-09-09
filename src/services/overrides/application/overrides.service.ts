import type { Overrides } from '@/lib/finance'
import { UnknownCategoryError } from '../domain/errors'
import type { OverrideRepository } from '../domain/ports/override-repository'

/**
 * Os casos de uso do ajuste manual de categoria.
 *
 * O que este serviço NÃO faz: decidir a categoria de um lançamento. Isso é do ingest, por
 * regra em `rules.config.ts`, e o `CLAUDE.md` é explícito — para tornar um ajuste permanente,
 * ele vira regra. Aqui só mora a exceção pontual que a pessoa marcou na tabela.
 *
 * `set(id, null)` REMOVE o ajuste em vez de gravar nulo. Um ajuste que aponta para lugar
 * nenhum não é um estado: é a ausência de ajuste, e guardá-lo faria a contagem de "quantos
 * ajustes existem" mentir.
 */
export interface OverridesServiceDeps {
  repository: OverrideRepository
  /** Se a categoria existe. Vem de fora porque o catálogo é vocabulário de domínio, não deste contexto. */
  categoryExists: (categoryId: string) => boolean
}

export interface OverridesService {
  list(): Promise<Overrides>
  set(transactionId: string, categoryId: string | null): Promise<Overrides>
  clear(): Promise<Overrides>
  count(): Promise<number>
}

export function makeOverridesService({ repository, categoryExists }: OverridesServiceDeps): OverridesService {
  return {
    list: () => repository.findAll(),

    async count() {
      return Object.keys(await repository.findAll()).length
    },

    async set(transactionId, categoryId) {
      if (categoryId !== null && !categoryExists(categoryId)) throw new UnknownCategoryError(categoryId)
      const current = await repository.findAll()
      const next = { ...current }
      if (categoryId === null) delete next[transactionId]
      else next[transactionId] = categoryId
      await repository.save(next)
      return next
    },

    async clear() {
      const empty: Overrides = {}
      await repository.save(empty)
      return empty
    },
  }
}
