import { createHash } from 'node:crypto'
import { inflateRawSync, inflateSync } from 'node:zlib'
import type { IngestEnv } from '../src/lib/ingest/io.ts'

/**
 * O `IngestEnv` do lado do Node — o gêmeo de `browserEnv`, em `src/lib/ingest/io.ts`.
 *
 * As duas capacidades que o núcleo não provê sozinho existem aqui de forma SÍNCRONA, e mesmo
 * assim são embrulhadas em promessa. Não é desperdício: o núcleo é `async` nos dois ambientes
 * de propósito, porque assinatura que muda conforme o ambiente é a duplicação de volta pela
 * porta dos fundos — o chamador passaria a precisar saber onde está rodando, que é exatamente
 * o que o contrato existe para impedir.
 *
 * `shortId` chama o `node:crypto` em vez de `src/lib/sha1.ts` porque é ele que produziu TODO id
 * já gravado, e `wlet.overrides` é chaveado por eles. Os dois são conferidos byte a byte em
 * `scripts/checks/sha1.test.ts` — se um dia divergirem, é aquele teste que quebra, e não a
 * categoria manual de alguém sumindo em silêncio.
 */
export const nodeEnv: IngestEnv = {
  async inflateRaw(data) {
    return new Uint8Array(inflateRawSync(data))
  },
  async inflate(data) {
    return new Uint8Array(inflateSync(data))
  },
  shortId(record) {
    return createHash('sha1').update(record).digest('hex').slice(0, 12)
  },
}
