/**
 * A base de todo erro que a camada de serviços deixa escapar.
 *
 * A regra importada da Selfie diz "erro de domínio, nunca `TRPCError`". Aqui o transporte é do
 * outro lado, e a mesma regra vira outra: **nunca deixar escapar erro de INFRAESTRUTURA**. O
 * `fetch` lança `TypeError: Failed to fetch` quando a rede cai; o oRPC lança o erro do contrato
 * com o código HTTP dentro; a sessão expirada volta como 401 sem texto nenhum. Os três chegariam
 * à tela em inglês, dizendo coisas que não descrevem o que a pessoa precisa fazer. O adapter
 * traduz; a tela lê português.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    // `Error` não preserva a subclasse no `name` sozinho, e é o `name` que aparece no console e
    // em qualquer log — sem isto, todo erro do app se chamaria "Error".
    this.name = new.target.name
  }
}

/** Não há armazenamento: janela anônima restrita, cookies bloqueados, navegador antigo. */
export class StorageUnavailableError extends DomainError {
  constructor(message = 'O navegador não permitiu guardar dados. Suas alterações valem só nesta sessão.') {
    super(message)
  }
}

/** A cota estourou. É o erro que o dataset grande produz onde o pequeno nunca produziria. */
export class StorageFullError extends DomainError {
  constructor(message = 'O espaço de armazenamento do navegador acabou. Exporte seus dados e libere espaço.') {
    super(message)
  }
}

/** O que estava gravado não tem a forma que a versão atual sabe ler. */
export class CorruptedDataError extends DomainError {
  constructor(message = 'Os dados guardados estão em formato irreconhecível e foram ignorados.') {
    super(message)
  }
}

/**
 * Traduz o que o navegador lançou. Fica aqui, e não em cada adapter, porque a tradução é a
 * mesma para os dois armazenamentos — duplicá-la seria a §10 da rule invertida.
 */
export function translateStorageError(cause: unknown): DomainError {
  if (cause instanceof DomainError) return cause
  const name = cause instanceof Error ? cause.name : ''
  // `QuotaExceededError` é o nome padrão; o Firefox usa `NS_ERROR_DOM_QUOTA_REACHED`.
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return new StorageFullError()
  if (name === 'SecurityError' || name === 'InvalidStateError') return new StorageUnavailableError()
  return new StorageUnavailableError(`Falha ao acessar o armazenamento do navegador: ${name || 'motivo desconhecido'}.`)
}
