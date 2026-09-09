import { DomainError } from '@/services/shared/domain/errors'

/** O conjunto recebido não tem as partes que o app precisa para desenhar qualquer tela. */
export class IncompleteDatasetError extends DomainError {
  constructor(missing: string[]) {
    super(`O conjunto de dados está incompleto. Faltam: ${missing.join(', ')}.`)
  }
}

/**
 * Pediram para reprocessar sem haver arquivo guardado.
 *
 * Acontece num navegador que nunca leu uma pasta — e a resposta certa não é erro de sistema, é
 * dizer o que fazer: escolher a pasta. Por isso a mensagem instrui em vez de descrever a falha.
 */
export class NoSourcesError extends DomainError {
  constructor(message = 'Não há arquivos guardados para reprocessar. Escolha a pasta com os extratos primeiro.') {
    super(message)
  }
}
