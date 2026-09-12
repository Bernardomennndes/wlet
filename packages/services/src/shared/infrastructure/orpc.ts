import type { WletClient } from '@wlet/api'
import { translateRemoteError } from '../domain/errors'

/**
 * A travessia entre o que o contrato manda pelo fio e o que o domínio usa.
 *
 * É a mesma conversão que o servidor faz do outro lado, e ela existe pela mesma razão: `RegExp`
 * não existe em JSON. Os dois lados precisam dela porque o contrato é UM — e é justamente isso
 * que impede as duas conversões de divergirem, já que a forma do fio está declarada num lugar só.
 */
export interface RegexWire {
  source: string
  flags: string
}

export const toRegexWire = (re: RegExp): RegexWire => ({ source: re.source, flags: re.flags })
export const fromRegexWire = ({ source, flags }: RegexWire): RegExp => new RegExp(source, flags)

/** O que todo adapter remoto precisa: o cliente tipado do contrato. */
export interface RemoteDeps {
  client: WletClient
}

/**
 * Toda chamada ao servidor passa por aqui, e o motivo é a tradução de erro.
 *
 * Sem este embrulho o que chega à tela é `TypeError: Failed to fetch` ou um `ORPCError` com o
 * status cru — em inglês, sem dizer o que fazer, e indistinguíveis entre "a rede caiu" e "a sua
 * sessão acabou", que pedem respostas opostas. A tradução mora em `shared/domain/errors.ts`
 * porque é a mesma para os cinco contextos; o que mora AQUI é a obrigação de aplicá-la, num
 * único ponto que todo adapter remoto atravessa.
 *
 * **PROIBIDO chamar `client.*` fora dele.** Uma chamada solta compila, funciona no caminho feliz
 * e só se revela no dia em que falha — que é exatamente o dia em que a mensagem importa.
 */
export async function remote<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    throw translateRemoteError(cause)
  }
}
