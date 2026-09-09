/**
 * SHA-1 síncrono, para o navegador — e a razão de ele existir é estreita.
 *
 * O id de cada transação é `sha1(perfil|data|valor|descrição|fitId|fatura|ordinal)` cortado
 * em 12 caracteres, e o `wlet.overrides` no navegador é CHAVEADO por esse id. Um byte de
 * diferença entre o que o Node grava e o que o navegador recalcula apaga, em silêncio, todo
 * ajuste manual de categoria que a pessoa já fez.
 *
 * Por que não `crypto.subtle.digest('SHA-1', …)`, que o navegador já traz: ela é ASSÍNCRONA.
 * O id é montado dentro do laço que normaliza cada lançamento — milhares por ingestão —, e
 * torná-lo `await` contaminaria toda a cadeia de parse, que hoje é síncrona e testada assim.
 * `crypto.subtle` também exige contexto seguro; num `file://` ela simplesmente não existe.
 *
 * A conferência não é de olho: `scripts/checks/sha1.test.ts` compara esta implementação com
 * `node:crypto` sobre entradas geradas, incluindo acento, emoji e as fronteiras de bloco de
 * 55/56/63/64 bytes, que é onde um padding errado passa despercebido.
 */
function rotl(n: number, b: number): number {
  return ((n << b) | (n >>> (32 - b))) >>> 0
}

export function sha1Hex(input: string): string {
  const msg = new TextEncoder().encode(input)
  const bitLen = msg.length * 8

  // Padding: 0x80, zeros até 56 mod 64, e o comprimento em 64 bits big-endian.
  const withPad = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6)
  withPad.set(msg)
  withPad[msg.length] = 0x80
  const view = new DataView(withPad.buffer)
  // O comprimento cabe em 53 bits com folga (Number.MAX_SAFE_INTEGER); os 32 altos saem da
  // divisão, e não de um shift, que em JS opera em 32 bits e zeraria tudo acima disso.
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(withPad.length - 4, bitLen >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)
  for (let offset = 0; offset < withPad.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return [h0, h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, '0')).join('')
}

/** O id como o ingest o escreve: sha1 do registro, cortado em 12. */
export function shortId(input: string): string {
  return sha1Hex(input).slice(0, 12)
}
