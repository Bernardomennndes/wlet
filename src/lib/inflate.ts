/**
 * O `node:zlib` dos parsers, traduzido para o navegador.
 *
 * São DOIS formatos, e trocá-los é um erro silencioso: `xlsx.ts` chama `inflateRawSync`
 * (deflate cru, como o ZIP guarda) e `pdf.ts` chama `inflateSync` (deflate com o cabeçalho
 * de 2 bytes do zlib, como o FlateDecode do PDF traz). No navegador viram
 * `DecompressionStream('deflate-raw')` e `DecompressionStream('deflate')`.
 *
 * A diferença que contamina o resto: as duas são ASSÍNCRONAS. Não há descompressão síncrona
 * no navegador sem embutir um inflate próprio, e um inflate próprio é onde um leitor de
 * planilha vira um projeto de compressão. Por isso o núcleo do ingest recebe o descompressor
 * INJETADO em vez de importá-lo: no Node ele resolve na hora, no navegador ele espera, e o
 * núcleo é `async` nos dois — uma implementação só, como `settlement.ts`.
 */
async function through(data: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  // Concatenação manual em vez de `Blob.arrayBuffer()`: um xlsx da B3 descomprime para alguns
  // MB de XML, e passar por um Blob intermediário dobraria a cópia sem ganhar nada.
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** Deflate CRU, sem cabeçalho — é o que o ZIP (e portanto o xlsx) guarda. */
export function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return through(data, 'deflate-raw')
}

/** Deflate COM o cabeçalho zlib — é o FlateDecode dos streams de PDF. */
export function inflate(data: Uint8Array): Promise<Uint8Array> {
  return through(data, 'deflate')
}

export function isSupported(): boolean {
  return typeof DecompressionStream !== 'undefined'
}
