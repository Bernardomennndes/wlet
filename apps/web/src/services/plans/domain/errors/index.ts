import { DomainError } from '@/services/shared/domain/errors'

/** Pediram um plano que não está no catálogo. */
export class PlanNotFoundError extends DomainError {
  constructor(message = 'Plano não encontrado.') {
    super(message)
  }
}

/** Pediram um grupo que não existe. */
export class PlanGroupNotFoundError extends DomainError {
  constructor(message = 'Grupo de planos não encontrado.') {
    super(message)
  }
}

/**
 * O plano recebido não pode existir com essa forma.
 *
 * Vale só para o que é IMPOSSÍVEL, não para o que está incompleto: plano sem mês e sem forma
 * de pagamento é legítimo — é o desejo ainda não decidido, e o app trata a ausência como
 * ausência. Preço negativo, ao contrário, não descreve compra nenhuma.
 */
export class InvalidPlanError extends DomainError {
  constructor(message = 'Os dados do plano são inválidos.') {
    super(message)
  }
}
