import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sha1Hex, shortId } from '../../src/lib/sha1.ts'

/**
 * O SHA-1 do navegador tem de ser IDÊNTICO ao do Node, byte a byte.
 *
 * Não é preciosismo: o id da transação sai daqui e o `wlet.overrides` é chaveado por ele.
 * Divergir não quebra nada visível — apaga os ajustes manuais de categoria em silêncio, que
 * é o pior modo de falhar. Por isso a referência do teste é o `node:crypto`, e não uma lista
 * de vetores copiada.
 */
const node = (s: string) => createHash('sha1').update(s).digest('hex')

describe('sha1 do navegador contra o node:crypto', () => {
  it('bate no vetor canônico', () => {
    assert.equal(sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('bate na string vazia', () => {
    assert.equal(sha1Hex(''), node(''))
  })

  it('bate em TODO comprimento de 0 a 200 bytes', () => {
    // As fronteiras de bloco (55/56, 63/64, 119/120) são onde um padding errado se esconde:
    // o bloco extra só é exigido quando o comprimento não cabe com os 8 bytes do tamanho.
    for (let n = 0; n <= 200; n++) {
      const s = 'a'.repeat(n)
      assert.equal(sha1Hex(s), node(s), `comprimento ${n}`)
    }
  })

  it('bate com acento, emoji e caractere fora do BMP', () => {
    // O Node codifica string em UTF-8 no `update`; o TextEncoder também. Se um dos dois
    // usasse UTF-16, só as entradas não-ASCII acusariam — e o app é todo em português.
    for (const s of ['Ação', 'Mercado do Seu João', 'CONTABILIZEI · MENSALIDADE', '💸', 'Pix — açaí 🍧', 'ÀÉÎÕÜ ç']) {
      assert.equal(sha1Hex(s), node(s), s)
    }
  })

  it('bate no formato real do registro do ingest', () => {
    // A mesma junção por "|" que `scripts/ingest.ts` monta antes de cortar em 12.
    const registro = ['nubank-cartao', '2026-03-14', '-129.90', 'PADARIA DO BAIRRO', 'FIT12345', '2026-04', 0].join('|')
    assert.equal(shortId(registro), node(registro).slice(0, 12))
    assert.equal(shortId(registro).length, 12)
  })

  it('bate em entradas longas e variadas', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let i = 0; i < 300; i++) {
      const len = Math.floor(rnd() * 500)
      let s = ''
      for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(rnd() * 200))
      assert.equal(sha1Hex(s), node(s), `entrada ${i} (${len} chars)`)
    }
  })
})
