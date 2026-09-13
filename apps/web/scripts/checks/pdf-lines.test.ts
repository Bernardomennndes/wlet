import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { browserEnv, type SourceFile } from '@wlet/ingest/io'
import { readPdfLines } from '@wlet/ingest/pdf'

/**
 * A reconstrução de linha por POSIÇÃO — o último pedaço de `ingest` sem teste.
 *
 * Eu havia registrado que testá-lo "exigiria um PDF sintético com objetos e fluxos comprimidos".
 * Errado, e pela terceira vez nesta série a barreira era uma premissa minha e não o código:
 * `decodeStream` devolve o stream CRU quando o dicionário não tem `/FlateDecode`, e a estrutura de
 * um PDF é ASCII. O fixture abaixo é texto, escrito à mão, sem compressão e sem dependência nova.
 *
 * O que ele exercita é a decisão que dá nome ao módulo: numa fatura, a data, a descrição e o valor
 * são três fragmentos com matriz própria, e juntá-los pela ORDEM DO FLUXO intercala colunas de
 * regiões diferentes da página. É por isso que a linha sai de (página, altura) e não da ordem em
 * que o gerador desenhou — e é um erro que não estoura: a fatura vira linhas embaralhadas, os
 * valores casam com as descrições erradas, e os totais continuam plausíveis.
 */

/** Um `/ToUnicode` que mapeia os códigos que os fixtures usam para letras legíveis. */
const CMAP = `/CIDInit /ProcSet findresource begin
beginbfchar
<0001> <0041> <0002> <0042> <0003> <0043> <0004> <0031> <0005> <0032> <0006> <0033>
endbfchar
end`

/** Texto posicionado: `Tm` põe a matriz, `Tj` desenha. Os códigos são os do CMAP acima. */
const draw = (x: number, y: number, codes: string) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${codes}) Tj ET`

const pdf = (content: string): SourceFile => {
  const body = [
    `1 0 obj << /Type /Font /Subtype /Type0 /ToUnicode 2 0 R >> endobj`,
    `2 0 obj << /Length ${CMAP.length} >> stream\n${CMAP}\nendstream endobj`,
    `3 0 obj << /Font << /F1 1 0 R >> /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ].join('\n')
  return { path: 'docs/fatura/nubank/2026-01.pdf', bytes: new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF`) }
}

/** Os códigos de dois bytes que o CMAP traduz: A=1, B=2, C=3, '1'=4, '2'=5, '3'=6. */
const A = '\\000\\001'
const B = '\\000\\002'
const C = '\\000\\003'
const UM = '\\000\\004'

describe('readPdfLines', () => {
  it('lê o texto pelo CMAP, e não os bytes crus', async () => {
    const [line] = await readPdfLines(pdf(draw(50, 700, A + B)), browserEnv)
    assert.equal(line.text, 'AB')
  })

  it('a linha sai da ALTURA, não da ordem do fluxo', async () => {
    // O ponto do módulo. Aqui o fluxo desenha a coluna da DIREITA primeiro — é o que um gerador
    // faz quando monta a tabela por coluna. Pela ordem do fluxo sairia "BA"; pela posição, "AB".
    const [line] = await readPdfLines(pdf([draw(300, 700, B), draw(50, 700, A)].join(' ')), browserEnv)
    assert.equal(line.text.replace(/\s+/g, ''), 'AB', 'o fragmento da esquerda vem primeiro, mesmo desenhado depois')
  })

  it('alturas diferentes são linhas diferentes, na ordem de leitura', async () => {
    const lines = await readPdfLines(pdf([draw(50, 700, A), draw(50, 680, B), draw(50, 660, C)].join(' ')), browserEnv)
    assert.deepEqual(
      lines.map((l) => l.text.trim()),
      ['A', 'B', 'C'],
    )
  })

  it('fração de baseline não separa a linha — a altura cai num BALDE de meio ponto', async () => {
    // Fragmentos da mesma linha divergem em frações por causa do ajuste de baseline. Comparar
    // altura exata os separaria, e a data sairia numa linha com o valor noutra.
    const [line, ...rest] = await readPdfLines(pdf([draw(50, 700, A), draw(300, 700.2, UM)].join(' ')), browserEnv)
    assert.equal(rest.length, 0, 'é uma linha só')
    assert.equal(line.text.replace(/\s+/g, ''), 'A1')
  })

  it('e o balde tem BORDA: o agrupamento é por arredondamento, não por tolerância', async () => {
    // Escrevi o caso acima com 0,3 de diferença esperando que juntasse, e ele SEPAROU — foi assim
    // que aprendi a forma real do agrupamento. `Math.round(y * 2) / 2` põe 700,0 num balde e
    // 700,3 noutro, então dois fragmentos podem estar a 0,1 de distância e cair em lados opostos
    // da borda.
    //
    // Fica escrito porque é o limite conhecido da reconstrução, e porque alguém que o descubra
    // numa fatura torta vai querer saber se é defeito ou desenho: é desenho, e alargar o balde
    // para consertar um caso junta linhas vizinhas de tabela apertada, que é pior.
    const lines = await readPdfLines(pdf([draw(50, 700, A), draw(300, 700.3, UM)].join(' ')), browserEnv)
    assert.equal(lines.length, 2, 'a borda do balde separa, e isso é conhecido')
  })

  it('fragmento sem CMAP não vira lixo — ele simplesmente não entra', async () => {
    // Perder uma fonte degrada o texto, e o total conferido pelo chamador denuncia o estrago.
    // O que não pode acontecer é o byte cru vazar para a descrição e virar um nome impossível.
    const semFonte = { path: 'docs/fatura/x.pdf', bytes: new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Length 40 >> stream\n${draw(50, 700, A)}\nendstream endobj\n%%EOF`) }
    const lines = await readPdfLines(semFonte, browserEnv)
    assert.ok(
      // Por código, e não por regex: um `/[\\x00-\\x08]/` acende o `no-control-regex` do oxlint, e
      // subir a linha de base de avisos por causa de um teste é trocar um sinal por outro.
      lines.every((l) => [...l.text].every((ch) => ch.charCodeAt(0) > 8)),
      'nenhum byte cru na saída',
    )
  })

  it('PDF sem texto nenhum devolve lista vazia, e não estoura', async () => {
    assert.deepEqual(await readPdfLines({ path: 'docs/fatura/vazia.pdf', bytes: new TextEncoder().encode('%PDF-1.4\n%%EOF') }, browserEnv), [])
  })
})
