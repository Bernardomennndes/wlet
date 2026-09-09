import { inflate, inflateRaw } from '../inflate'
import { shortId } from '../sha1'

/**
 * O contrato que permite UMA implementação do ingest servir aos dois ambientes.
 *
 * Hoje o pipeline mora em `scripts/` e fala Node: `readFileSync`, `readdirSync`,
 * `zlib.inflateRawSync`, `crypto.createHash`. Nenhuma dessas existe no navegador. A saída
 * óbvia — reescrever o pipeline para o navegador — produziria DUAS implementações do mesmo
 * casamento e da mesma categorização, e elas divergiriam no primeiro ajuste. É exatamente o
 * argumento que o projeto já aplicou a `settlement.ts`, que é uma só para cobrança e conta a
 * pagar, e a `matching.ts`, usada pelo ingest E pelo seed.
 *
 * Então o núcleo não importa I/O: ele RECEBE. O adaptador Node resolve na hora e escreve
 * JSON; o adaptador navegador espera o `DecompressionStream` e grava no IndexedDB. O núcleo
 * é `async` nos dois — não porque o Node precise, mas porque assinatura que muda por ambiente
 * é a mesma duplicação por outro nome.
 */
export interface SourceFile {
  /**
   * Caminho relativo como `docs/extrato/inter/extrato.ofx`.
   *
   * É a IDENTIDADE do arquivo, não um detalhe de onde ele está: `accounts.config` casa conta
   * por `pathIncludes` ('fatura/xp' distingue o cartão da conta no mesmo banco), e a
   * deduplicação de downloads repetidos compara caminhos. No navegador não há sistema de
   * arquivos, então quem soltar os arquivos na tela precisa preservar o caminho relativo —
   * é o que `webkitRelativePath` devolve numa seleção de pasta.
   */
  path: string
  bytes: Uint8Array
}

/** As três capacidades que o núcleo não consegue prover sozinho. */
export interface IngestEnv {
  /** Deflate cru — o ZIP de um xlsx. */
  inflateRaw(data: Uint8Array): Promise<Uint8Array>
  /** Deflate com cabeçalho zlib — o FlateDecode de um PDF. */
  inflate(data: Uint8Array): Promise<Uint8Array>
  /**
   * O id de 12 caracteres de um lançamento.
   *
   * Está no contrato, e não importado direto, porque é a peça que NÃO pode divergir: o
   * `wlet.overrides` é chaveado por ele, e uma segunda implementação apagaria os ajustes
   * manuais de categoria em silêncio. Injetado, os dois ambientes recebem provadamente a
   * mesma função.
   */
  shortId(record: string): string
}

/** O ambiente do navegador. O do Node vive em `scripts/`, onde as APIs síncronas existem. */
export const browserEnv: IngestEnv = { inflateRaw, inflate, shortId }

/** Texto de um arquivo, na codificação que os extratos usam. */
export function decodeText(bytes: Uint8Array, encoding = 'utf-8'): string {
  return new TextDecoder(encoding).decode(bytes)
}
