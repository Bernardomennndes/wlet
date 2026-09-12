/**
 * A base de todo erro que a camada de serviços deixa escapar.
 *
 * A regra importada da Selfie diz "erro de domínio, nunca `TRPCError`". Aqui o transporte é HTTP,
 * e a mesma regra vira outra: **nunca deixar escapar erro de INFRAESTRUTURA**. O `fetch` lança
 * `TypeError: Failed to fetch` quando a rede cai — uma frase que não diz nem que houve rede
 * envolvida; o oRPC lança `ORPCError` com o código do contrato e o status HTTP dentro; e uma
 * sessão expirada chega como 401 sem texto nenhum. Os três chegariam à tela em inglês, dizendo
 * coisas que não descrevem o que a pessoa precisa fazer. O adapter traduz; a tela lê português.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    // `Error` não preserva a subclasse no `name` sozinho, e é o `name` que aparece no console e
    // em qualquer log — sem isto, todo erro do app se chamaria "Error".
    this.name = new.target.name
  }
}

/** A requisição não chegou: servidor desligado, rede caída, DNS errado, CORS recusando. */
export class ServerUnreachableError extends DomainError {
  constructor(message = 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.') {
    super(message)
  }
}

/**
 * A sessão acabou. É o erro mais comum de todos e o único cuja resposta é sair e entrar de novo.
 *
 * Separado do resto porque a tela pode agir sobre ele — mandar para a entrada — e não sobre um
 * "falha ao gravar" genérico.
 */
export class SessionExpiredError extends DomainError {
  constructor(message = 'Sua sessão expirou. Entre de novo para continuar.') {
    super(message)
  }
}

/** O servidor entendeu e RECUSOU: a conta não tem acesso àquilo. */
export class ForbiddenError extends DomainError {
  constructor(message = 'Esta conta não tem acesso a este dado.') {
    super(message)
  }
}

/**
 * O servidor recusou a FORMA do que foi enviado.
 *
 * Carrega a mensagem do servidor quando há uma: ela nomeia o campo, e um "dados inválidos" sem
 * campo manda a pessoa procurar o erro em vinte lugares.
 */
export class InvalidRequestError extends DomainError {
  constructor(message = 'O servidor recusou os dados enviados.') {
    super(message)
  }
}

/** Quebrou do outro lado. Não há o que a pessoa faça além de tentar de novo. */
export class ServerError extends DomainError {
  constructor(message = 'O servidor falhou ao responder. Tente de novo em instantes.') {
    super(message)
  }
}

/** O que veio do servidor não tem a forma que a versão atual sabe ler. */
export class CorruptedDataError extends DomainError {
  constructor(message = 'Os dados recebidos estão em formato irreconhecível e foram ignorados.') {
    super(message)
  }
}

/**
 * O que o oRPC lança, por baixo do nome da classe.
 *
 * Conferido por FORMA e não por `instanceof`: a própria biblioteca documenta que o `instanceof`
 * dela falha quando o mesmo pacote existe em mais de um grafo de dependências, e implementa um
 * `Symbol.hasInstance` para contornar. Depender de uma classe que admite não ser reconhecível é
 * pedir para a tradução falhar em silêncio justamente no ambiente mais difícil de reproduzir.
 */
function statusOf(cause: unknown): number | null {
  if (typeof cause !== 'object' || cause === null) return null
  const status = (cause as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

/**
 * Traduz o que a chamada remota lançou. Fica aqui, e não em cada adapter, porque a tradução é a
 * mesma para os cinco contextos — duplicá-la seria a §10 da rule invertida.
 *
 * **Erro de domínio passa intacto.** Um `UnknownCategoryError` levantado pelo caso de uso não
 * pode virar "o servidor falhou": ele já é a mensagem certa, e reembrulhá-lo apagaria a única
 * informação útil.
 */
export function translateRemoteError(cause: unknown): DomainError {
  if (cause instanceof DomainError) return cause

  const status = statusOf(cause)
  // Sem status é porque a requisição não chegou a ter resposta — `TypeError: Failed to fetch`,
  // que é o que o navegador lança para rede caída, servidor desligado e CORS recusando por igual.
  if (status === null) return new ServerUnreachableError()

  if (status === 401) return new SessionExpiredError()
  if (status === 403) return new ForbiddenError()
  if (status === 400 || status === 422) {
    const message = cause instanceof Error ? cause.message : ''
    return new InvalidRequestError(message ? `O servidor recusou os dados enviados: ${message}` : undefined)
  }
  if (status >= 500) return new ServerError()
  return new ServerError(`O servidor respondeu ${status} e a chamada não pôde ser concluída.`)
}
