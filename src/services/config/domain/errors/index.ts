import { DomainError } from '@/services/shared/domain/errors'

/** A configuração recebida não descreve uma regra que o ingest saiba aplicar. */
export class InvalidConfigError extends DomainError {
  constructor(message = 'A configuração é inválida.') {
    super(message)
  }
}

/**
 * Pediram a configuração antes de haver de onde semeá-la.
 *
 * Acontece quando o IndexedDB está vazio E o chamador não forneceu semente — estado possível
 * só num erro de montagem, e por isso ele grita em vez de devolver configuração em branco:
 * config vazia faz o app projetar zero e parecer que a pessoa não tem conta nenhuma.
 */
export class ConfigUnavailableError extends DomainError {
  constructor(message = 'Não há configuração gravada nem semente para partir.') {
    super(message)
  }
}
