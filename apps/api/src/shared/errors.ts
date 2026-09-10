import { ORPCError } from '@orpc/server'

/**
 * Traduz o erro do DOMÍNIO no erro do fio.
 *
 * Os serviços lançam erros nomeados — `IncompleteDatasetError`, `InvalidConfigError`,
 * `NoSourcesError` — e cada um carrega uma razão que a tela sabe explicar. Sem esta tradução
 * todos virariam "500 Internal Server Error", e o cliente teria de adivinhar pela mensagem, que
 * é texto para humano e muda. O `code` sobrevive à travessia; a mensagem viaja junto para quem
 * lê, não para quem decide.
 */
export function toWireError(cause: unknown): ORPCError<string, unknown> {
  const name = cause instanceof Error ? cause.constructor.name : ''
  const message = cause instanceof Error ? cause.message : String(cause)

  if (name === 'IncompleteDatasetError') return new ORPCError('BAD_REQUEST', { message, data: { code: 'INCOMPLETE_DATASET' } })
  if (name === 'InvalidConfigError') return new ORPCError('BAD_REQUEST', { message, data: { code: 'INVALID_CONFIG' } })
  if (name === 'NoSourcesError') return new ORPCError('BAD_REQUEST', { message, data: { code: 'NO_SOURCES' } })
  return new ORPCError('INTERNAL_SERVER_ERROR', { message })
}
