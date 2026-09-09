import { DomainError } from '@/services/shared/domain/errors'

/** O período recebido não descreve uma janela que se possa desenhar. */
export class InvalidPeriodError extends DomainError {
  constructor(message = 'O período é inválido.') {
    super(message)
  }
}
