import { DomainError } from '@/services/shared/domain/errors'

/** O conjunto recebido não tem as partes que o app precisa para desenhar qualquer tela. */
export class IncompleteDatasetError extends DomainError {
  constructor(missing: string[]) {
    super(`O conjunto de dados está incompleto. Faltam: ${missing.join(', ')}.`)
  }
}
