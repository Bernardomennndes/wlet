/**
 * Um xlsx mínimo: ZIP de entradas STORED.
 *
 * Mora aqui porque DOIS testes o usam — o do leitor de planilha e o do razão da corretora —, e
 * duplicá-lo faria as duas cópias divergirem no primeiro ajuste de cabeçalho. É o mesmo argumento
 * que a §10 da rule de serviços aplica a capacidade de domínio.
 *
 * Funciona porque o leitor aceita `method === 0` (sem compressão), o que dispensa deflate e, com
 * ele, qualquer dependência nova. Nenhum byte aqui é dado de ninguém.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Um ZIP de entradas STORED. É o mínimo que `readEntries` de `xlsx.ts` precisa saber ler. */
export function xlsxOf(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(content)
    const sum = crc32(data)

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // assinatura do cabeçalho local
    lv.setUint16(4, 20, true) // versão necessária
    lv.setUint16(8, 0, true) // método 0 = STORED
    lv.setUint32(14, sum, true)
    lv.setUint32(18, data.length, true) // comprimido
    lv.setUint32(22, data.length, true) // sem compressão: os dois são iguais
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    const entry = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true) // assinatura do diretório central
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(16, sum, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    entry.set(nameBytes, 46)

    parts.push(local, data)
    central.push(entry)
    offset += local.length + data.length
  }

  const centralSize = central.reduce((total, e) => total + e.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // fim do diretório central
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((total, p) => total + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}
