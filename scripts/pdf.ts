import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/**
 * Extrator mínimo de TEXTO de PDF — só o suficiente para as faturas do Nubank.
 *
 * Ele existe porque o Nubank não publica OFX nem CSV para faturas anteriores a 2024, e são
 * três anos de histórico. É a única fonte deste projeto que não é texto estruturado, e por
 * isso ela vem com uma trava: quem a usa CONFERE a soma dos lançamentos contra o total que a
 * própria fatura declara. Sem essa conferência, um erro de layout entra como dado e ninguém
 * percebe — que é exatamente a razão de o resto do projeto preferir OFX.
 *
 * Sem dependência: `zlib.inflateSync` do Node dá conta do FlateDecode, e o resto é análise de
 * texto. O que NÃO é suportado, e não precisa ser: PDF criptografado, streams de objeto
 * (ObjStm), CCITT/DCT em texto e escrita vertical.
 *
 * Quatro armadilhas medidas na construção, todas silenciosas:
 *
 * 1. **As fontes usam Identity-H.** O que está no fluxo não são caracteres, são IDs de glifo.
 *    Sem aplicar o `/ToUnicode` de cada fonte, o texto sai como lixo — ou como nada.
 * 2. **O nome da fonte não é `/F1`.** Neste gerador é `/Xi2`. Um regex que só aceite `F\d+`
 *    nunca casa, a fonte corrente fica vazia e TODO o texto decodifica para string vazia.
 * 3. **O texto está em string literal `(…)`, não em hexadecimal `<…>`.** Os bytes crus são os
 *    CIDs, dois a dois, com os escapes de PDF pelo meio.
 * 4. **`Td` é RELATIVO.** Tratá-lo como posição absoluta empilha todas as linhas numa só —
 *    o sintoma foi uma linha com onze datas coladas.
 */

interface PdfObject {
  dict: string
  stream: Buffer | null
}

/**
 * Todo `N G obj … endobj` do arquivo, por varredura.
 *
 * Varrer em vez de seguir a tabela xref é deliberado: xref quebrado ou com `Prev` encadeado é
 * comum em PDF gerado por sistema, e aqui não há nada a perder — o arquivo inteiro cabe na
 * memória e objeto órfão simplesmente não é referenciado por ninguém.
 */
function readObjects(buffer: Buffer): Map<number, PdfObject> {
  const text = buffer.toString('latin1')
  const out = new Map<number, PdfObject>()
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length
    const end = text.indexOf('endobj', start)
    if (end < 0) continue
    const body = text.slice(start, end)
    const at = body.indexOf('stream')
    if (at < 0) {
      out.set(Number(match[1]), { dict: body, stream: null })
      continue
    }
    let p = start + at + 'stream'.length
    if (text[p] === '\r') p++
    if (text[p] === '\n') p++
    const stop = text.indexOf('endstream', p)
    out.set(Number(match[1]), { dict: body.slice(0, at), stream: buffer.subarray(p, stop < 0 ? buffer.length : stop) })
  }
  return out
}

function decodeStream(object: PdfObject): string {
  if (!object.stream) return ''
  if (!/\/FlateDecode/.test(object.dict)) return object.stream.toString('latin1')
  try {
    return inflateSync(object.stream).toString('latin1')
  } catch {
    // Stream que não infla (criptografado, ou filtro que não tratamos) é ignorado: perder uma
    // fonte degrada o texto, e o total conferido pelo chamador denuncia o estrago.
    return ''
  }
}

/** Um CMap `/ToUnicode`: o que traduz ID de glifo em caractere. */
function parseCMap(source: string): Map<number, string> {
  const map = new Map<number, string>()
  const toText = (hex: string) => {
    let out = ''
    for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16))
    return out
  }
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(Number.parseInt(pair[1], 16), toText(pair[2]))
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const from = Number.parseInt(range[1], 16)
      const to = Number.parseInt(range[2], 16)
      const start = Number.parseInt(range[3], 16)
      for (let code = from; code <= to && code - from < 65_535; code++) map.set(code, String.fromCharCode(start + (code - from)))
    }
  return map
}

/** Os bytes de uma string literal de PDF, resolvendo os escapes. */
function literalBytes(raw: string): number[] {
  const out: number[] = []
  const ESCAPES: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 }
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') {
      out.push(raw.charCodeAt(i))
      continue
    }
    const next = raw[++i]
    if (next >= '0' && next <= '7') {
      let octal = next
      while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') octal += raw[++i]
      out.push(Number.parseInt(octal, 8))
    } else out.push(ESCAPES[next] ?? raw.charCodeAt(i))
  }
  return out
}

/** Um pedaço de texto e onde ele foi desenhado. */
interface Fragment {
  page: number
  x: number
  y: number
  text: string
}

export interface PdfLine {
  page: number
  text: string
}

/**
 * As linhas de texto do PDF, na ordem de leitura.
 *
 * A linha é reconstruída por POSIÇÃO, não pela ordem em que o fluxo desenha: numa tabela, a
 * data, a descrição e o valor são três fragmentos com matriz própria, e juntá-los pela ordem
 * do fluxo intercala colunas de regiões diferentes da página. Agrupar por (página, altura) e
 * ordenar por x devolve a linha que o olho lê.
 *
 * A altura é arredondada a meio ponto: fragmentos da mesma linha divergem em frações por
 * causa do ajuste de baseline, e comparar exato os separaria.
 */
export function readPdfLines(path: string): PdfLine[] {
  const buffer = readFileSync(path)
  const objects = readObjects(buffer)

  const cmaps = new Map<string, Map<number, string>>()
  for (const [, object] of objects) {
    for (const ref of object.dict.matchAll(/\/([A-Za-z][A-Za-z0-9]*)\s+(\d+)\s+\d+\s+R/g)) {
      const font = objects.get(Number(ref[2]))
      if (!font || !/\/Font|\/Type0|\/TrueType|\/Type1/.test(font.dict)) continue
      const toUnicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(font.dict)
      if (!toUnicode) continue
      const cmap = objects.get(Number(toUnicode[1]))
      if (cmap) cmaps.set(ref[1], parseCMap(decodeStream(cmap)))
    }
  }

  const fragments: Fragment[] = []
  let page = 0
  for (const [, object] of objects) {
    const content = decodeStream(object)
    if (!/\bBT\b/.test(content) || !/\bTf\b/.test(content)) continue
    page++

    let font = ''
    let x = 0
    let y = 0
    let leading = 0
    let buffered = ''
    const flush = () => {
      if (buffered.trim()) fragments.push({ page, x, y, text: buffered })
      buffered = ''
    }
    const decode = (raw: string) => {
      const cmap = cmaps.get(font)
      const bytes = literalBytes(raw)
      let out = ''
      for (let i = 0; i + 1 < bytes.length; i += 2) out += cmap?.get((bytes[i] << 8) | bytes[i + 1]) ?? ''
      return out
    }

    const re =
      /([\d.-]+)\s+TL|\/([A-Za-z][A-Za-z0-9]*)\s+[\d.]+\s+Tf|([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+Tm|([\d.-]+)\s+([\d.-]+)\s+Td|\[((?:\\.|[^\]])*)\]\s*TJ|\(((?:\\.|[^)])*)\)\s*Tj|\bT\*/g
    let op: RegExpExecArray | null
    while ((op = re.exec(content))) {
      if (op[1] !== undefined) {
        leading = Number(op[1])
        continue
      }
      if (op[2]) {
        font = op[2]
        continue
      }
      if (op[8] !== undefined) {
        flush()
        x = Number(op[7])
        y = Number(op[8])
        continue
      }
      if (op[10] !== undefined) {
        // Relativo, não absoluto — ver a armadilha 4 no cabeçalho.
        flush()
        x += Number(op[9])
        y += Number(op[10])
        continue
      }
      if (op[11] !== undefined) {
        for (const piece of op[11].matchAll(/\(((?:\\.|[^)])*)\)|(-?[\d.]+)/g)) {
          if (piece[1] !== undefined) buffered += decode(piece[1])
          // Recuo grande entre pedaços é espaço. Abaixo disso é ajuste de kerning, e virar
          // espaço ali quebraria palavras no meio.
          else if (Number(piece[2]) < -150) buffered += ' '
        }
        continue
      }
      if (op[12] !== undefined) {
        buffered += decode(op[12])
        continue
      }
      flush()
      y -= leading
    }
    flush()
  }

  const byLine = new Map<string, Fragment[]>()
  for (const fragment of fragments) {
    const key = `${fragment.page}|${Math.round(fragment.y * 2) / 2}`
    const list = byLine.get(key)
    if (list) list.push(fragment)
    else byLine.set(key, [fragment])
  }

  return [...byLine.entries()]
    .sort((a, b) => {
      const [pageA, yA] = a[0].split('|').map(Number)
      const [pageB, yB] = b[0].split('|').map(Number)
      return pageA - pageB || yB - yA
    })
    .map(([key, list]) => ({
      page: Number(key.split('|')[0]),
      text: list
        .sort((a, b) => a.x - b.x)
        .map((f) => f.text)
        .join('  ')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
}
