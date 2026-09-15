import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deflateSync } from 'node:zlib'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { readPdfLines } from '@wlet/ingest/pdf'

/**
 * O `/FlateDecode` de um PDF — e a armadilha que só o NAVEGADOR tem.
 *
 * `pdf-lines.test.ts` monta fluxos SEM compressão, porque o `decodeStream` devolve o stream cru
 * quando o dicionário não tem `/FlateDecode`. Foi o que tornou aquele teste possível, e é também
 * o que o faz desviar do caminho que TODO PDF real percorre: uma fatura vem comprimida.
 *
 * E há uma diferença medida entre os dois ambientes: o `DecompressionStream` do navegador RECUSA
 * byte sobrando depois do fim do fluxo — "Trailing junk found after the end of the compressed
 * stream" — enquanto o `zlib.inflateSync` do Node o ignora em silêncio. O PDF EXIGE uma quebra de
 * linha entre os dados e a palavra `endstream`, então quase todo fluxo real chega com um `\r\n` a
 * mais. Sem o remendo que tenta de novo aparando o fim, o navegador perderia toda fonte e todo
 * conteúdo de página, e o arquivo decodificaria para NADA.
 *
 * Estes testes rodam contra o `browserEnv`, que usa `DecompressionStream` — então a armadilha
 * acontece aqui de verdade, e não em teoria.
 */
const CMAP = `/CIDInit /ProcSet findresource begin
beginbfchar
<0001> <0041> <0002> <0042>
endbfchar
end`

const draw = (x: number, y: number, codes: string) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${codes}) Tj ET`
const A = '\\000\\001'
const B = '\\000\\002'

/** Um objeto com fluxo: comprimido ou não, com ou sem a quebra de linha antes de `endstream`. */
function object(id: number, dict: string, body: Buffer, { eol = '\n' }: { eol?: string } = {}): Buffer {
  return Buffer.concat([Buffer.from(`${id} 0 obj << ${dict} /Length ${body.length} >> stream\n`), body, Buffer.from(`${eol}endstream endobj\n`)])
}

function pdf(parts: Buffer[]): SourceFile {
  return { path: 'docs/fatura/nubank/2026-01.pdf', bytes: new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.4\n'), ...parts, Buffer.from('%%EOF')])) }
}

const font = (comprimida: boolean) => (comprimida ? object(2, '/Filter /FlateDecode', deflateSync(Buffer.from(CMAP))) : object(2, '', Buffer.from(CMAP)))

const FONT_DICT = Buffer.from('1 0 obj << /Type /Font /Subtype /Type0 /ToUnicode 2 0 R >> endobj\n')

describe('o fluxo COMPRIMIDO é lido', () => {
  it('conteúdo em `/FlateDecode` chega ao texto', async () => {
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', deflateSync(Buffer.from(draw(50, 700, A + B))))
    const [line] = await readPdfLines(pdf([FONT_DICT, font(false), content]), browserEnv)
    assert.equal(line.text, 'AB')
  })

  it('e a FONTE comprimida também — senão o texto vira lixo', async () => {
    // O CMAP é o que traduz glifo em caractere. Perdido, o byte cru vaza para a descrição e vira
    // um nome impossível; o valor continua certo e a categoria erra.
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', deflateSync(Buffer.from(draw(50, 700, A + B))))
    const [line] = await readPdfLines(pdf([FONT_DICT, font(true), content]), browserEnv)
    assert.equal(line.text, 'AB')
  })
})

describe('a quebra de linha antes de `endstream`', () => {
  it('um `\\r\\n` sobrando não derruba a leitura — é o caso de QUASE TODO PDF real', async () => {
    // A armadilha medida. O PDF exige o EOL; a fatia vai até `endstream`; o descompressor do
    // navegador recusa o byte extra. Sem a nova tentativa aparando o fim, isto devolve vazio —
    // e o arquivo inteiro decodifica para nada, sem erro nenhum.
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', deflateSync(Buffer.from(draw(50, 700, A + B))), { eol: '\r\n' })
    const [line] = await readPdfLines(pdf([FONT_DICT, font(false), content]), browserEnv)
    assert.equal(line?.text, 'AB')
  })

  it('e um `\\n` sozinho também não', async () => {
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', deflateSync(Buffer.from(draw(50, 700, A))), { eol: '\n' })
    const [line] = await readPdfLines(pdf([FONT_DICT, font(false), content]), browserEnv)
    assert.equal(line?.text.trim(), 'A')
  })
})

describe('o que não infla é IGNORADO, não estoura', () => {
  it('fluxo que se diz comprimido e não é vira texto vazio', async () => {
    // Criptografado, ou com um filtro que não tratamos. Perder uma fonte degrada o texto, e o
    // total conferido pelo chamador denuncia o estrago — derrubar a leitura inteira seria pior.
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', Buffer.from('isto não é deflate nenhum'))
    assert.deepEqual(await readPdfLines(pdf([FONT_DICT, font(false), content]), browserEnv), [])
  })

  it('e byte sobrando que NÃO é fim de linha não é aparado', async () => {
    // O remendo só corta `\\n` e `\\r`. Cortar qualquer byte final iria, cedo ou tarde, comer dado
    // comprimido de verdade e devolver um texto silenciosamente incompleto.
    const content = object(3, '/Filter /FlateDecode /Font << /F1 1 0 R >>', Buffer.concat([deflateSync(Buffer.from(draw(50, 700, A))), Buffer.from('X')]))
    assert.deepEqual(await readPdfLines(pdf([FONT_DICT, font(false), content]), browserEnv), [])
  })
})
