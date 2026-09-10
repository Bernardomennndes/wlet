import { DomainError } from '../../../shared/domain/errors'

/** A configuração recebida não descreve uma regra que o ingest saiba aplicar. */
export class InvalidConfigError extends DomainError {
  constructor(message = 'A configuração é inválida.') {
    super(message)
  }
}
