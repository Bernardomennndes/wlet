import { DomainError } from '@/services/shared/domain/errors'

/** Tentaram apontar para uma categoria que o catálogo não tem. */
export class UnknownCategoryError extends DomainError {
  constructor(categoryId: string) {
    super(`A categoria "${categoryId}" não existe no catálogo.`)
  }
}
