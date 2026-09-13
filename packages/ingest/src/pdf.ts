import type { IngestEnv, SourceFile } from './io'

/**
 * Extrator mínimo de TEXTO de PDF — só o suficiente para as faturas do Nubank.
 *
 * Ele existe porque o Nubank não publica OFX nem CSV para faturas anteriores a 2024, e são
 * três anos de histórico. É a única fonte deste projeto que não é texto estruturado, e por
 * isso ela vem com uma trava: quem a usa CONFERE a soma dos lançamentos contra o total que a
 * própria fatura declara. Sem essa conferência, um erro de layout entra como dado e ninguém
 * percebe — que é exatamente a razão de o resto do projeto preferir OFX.
 *
 * Sem dependência: o FlateDecode é resolvido pelo `inflate` do `IngestEnv` (no navegador,
 * `DecompressionStream('deflate')`; no Node, `zlib.inflateSync`), e o resto é análise de
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
 *
 * A quinta é do PORTE, e só aparece no navegador: ver `inflateStream`.
 */

interface PdfObject {
  dict: string
  stream: Uint8Array | null
}

/**
 * Os bytes como texto latin1 — um byte, um caractere.
 *
 * É o `buffer.toString('latin1')` do Node, escrito à mão porque `TextDecoder('latin1')` NÃO
 * faz isso: pela especificação de codificação, o rótulo é apelido de windows-1252, e os bytes
 * de 0x80 a 0x9F viram outros pontos de código (0x80 vira o símbolo do euro). Aqui a
 * identidade byte↔caractere é o que sustenta o módulo inteiro: os deslocamentos achados no
 * texto (`stream`, `endstream`) são usados para fatiar os BYTES, e só coincidem porque cada
 * caractere vale exatamente um byte.
 */
function latin1(bytes: Uint8Array): string {
  let out = ''
  // Em blocos porque `String.fromCharCode(...)` com centenas de milhares de argumentos estoura
  // a pilha; uma fatura tem ~150 KB, então o laço roda poucas vezes.
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) out += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  return out
}

/**
 * Todo `N G obj … endobj` do arquivo, por varredura.
 *
 * Varrer em vez de seguir a tabela xref é deliberado: xref quebrado ou com `Prev` encadeado é
 * comum em PDF gerado por sistema, e aqui não há nada a perder — o arquivo inteiro cabe na
 * memória e objeto órfão simplesmente não é referenciado por ninguém.
 */
function readObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const text = latin1(bytes)
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
    out.set(Number(match[1]), { dict: body.slice(0, at), stream: bytes.subarray(p, stop < 0 ? bytes.length : stop) })
  }
  return out
}

/**
 * A quinta armadilha, e ela é do PORTE: o `DecompressionStream` do navegador RECUSA byte
 * sobrando depois do fim do fluxo ("Trailing junk found after the end of the compressed
 * stream"), enquanto o `zlib.inflateSync` do Node o ignora em silêncio.
 *
 * Isso importa porque o PDF exige uma quebra de linha entre os dados e a palavra `endstream`,
 * e a fatia daqui vai até `endstream` — então quase todo fluxo chega com um `\r\n` a mais.
 * Medido: sem este remendo, o navegador perderia TODA fonte e TODO conteúdo de página, e o
 * arquivo inteiro decodificaria para nada — exatamente o modo de falha silenciosa que as
 * outras quatro armadilhas descrevem.
 *
 * A tentativa é em ordem, e só sobre byte que é de fato fim de linha: primeiro a fatia
 * inteira (que é o caso do gerador que não escreve a quebra), depois sem os até dois bytes de
 * EOL. Nunca se corta um byte que possa ser dado comprimido de verdade.
 */
async function inflateStream(env: IngestEnv, stream: Uint8Array): Promise<Uint8Array | null> {
  let end = stream.length
  for (;;) {
    try {
      return await env.inflate(stream.subarray(0, end))
    } catch {
      const previous = stream[end - 1]
      if (end >= stream.length - 1 && (previous === 10 || previous === 13)) end--
      else return null
    }
  }
}

async function decodeStream(env: IngestEnv, object: PdfObject): Promise<string> {
  if (!object.stream) return ''
  if (!/\/FlateDecode/.test(object.dict)) return latin1(object.stream)
  const inflated = await inflateStream(env, object.stream)
  // Stream que não infla (criptografado, ou filtro que não tratamos) é ignorado: perder uma
  // fonte degrada o texto, e o total conferido pelo chamador denuncia o estrago.
  return inflated ? latin1(inflated) : ''
}

/**
 * Um CMap `/ToUnicode`: o que traduz ID de glifo em caractere.
 *
 * Exportada para teste: é pura, e é onde o texto da fatura vira legível ou vira lixo. Um mapa
 * errado não estoura — a descrição sai embaralhada, não casa regra nenhuma e o gasto cai em
 * `outros`, com o valor certo e a categoria errada.
 */
export function parseCMap(source: string): Map<number, string> {
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

/**
 * Os bytes de uma string literal de PDF, resolvendo os escapes.
 *
 * Exportada pela mesma razão do `parseCMap`: pura, e o escape octal mal lido troca um caractere
 * no meio do nome do estabelecimento — o suficiente para a regra de categoria não casar.
 */
export function literalBytes(raw: string): number[] {
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
export async function readPdfLines(file: SourceFile, env: IngestEnv): Promise<PdfLine[]> {
  const objects = readObjects(file.bytes)

  const cmaps = new Map<string, Map<number, string>>()
  for (const [, object] of objects) {
    for (const ref of object.dict.matchAll(/\/([A-Za-z][A-Za-z0-9]*)\s+(\d+)\s+\d+\s+R/g)) {
      const font = objects.get(Number(ref[2]))
      if (!font || !/\/Font|\/Type0|\/TrueType|\/Type1/.test(font.dict)) continue
      const toUnicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(font.dict)
      if (!toUnicode) continue
      const cmap = objects.get(Number(toUnicode[1]))
      if (cmap) cmaps.set(ref[1], parseCMap(await decodeStream(env, cmap)))
    }
  }

  const fragments: Fragment[] = []
  let page = 0
  for (const [, object] of objects) {
    const content = await decodeStream(env, object)
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
