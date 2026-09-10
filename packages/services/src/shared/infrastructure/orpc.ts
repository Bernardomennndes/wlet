import type { WletClient } from '@wlet/api'

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
