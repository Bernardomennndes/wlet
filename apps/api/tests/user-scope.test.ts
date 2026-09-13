import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Toda consulta de router é presa ao `userId` — as duas pontas.
 *
 * Este servidor guarda extrato bancário inteiro, e o que separa uma pessoa da outra é uma COLUNA.
 * Um `where` sem ela devolve o dado de todo mundo; um `insert` sem ela grava órfão, que some da
 * leitura de quem gravou. Nenhum dos dois estoura: o primeiro mostra números que não são seus, o
 * segundo mostra menos números do que deveria.
 *
 * Os testes de comportamento ao lado (`routers.test.ts`) provam o isolamento nos cinco domínios,
 * contra um Postgres de verdade — e são eles que valem. Este arquivo cobre o que aqueles não
 * alcançam: uma consulta NOVA, num router existente ou num arquivo que ainda não tem teste. Ele lê
 * a fonte porque é a única forma de falar sobre código que ninguém exercitou.
 *
 * Medido quando foi escrito: 30 cláusulas `where` e 15 `values`, todas com `userId`.
 */
const routers = fileURLToPath(new URL('../src/routers/', import.meta.url))

/** Sem comentário: eles explicam o `userId` e contá-los responderia pela prosa. */
function codeOf(name: string): string {
  return readFileSync(`${routers}${name}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** O conteúdo de cada `nome(` … `)`, fechando o parêntese no mesmo nível. */
function callsOf(source: string, name: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = []
  for (const found of source.matchAll(new RegExp(`\\.${name}\\(`, 'g'))) {
    let i = found.index + found[0].length - 1
    let depth = 0
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')' && --depth === 0) break
    }
    out.push({ line: source.slice(0, found.index).split('\n').length, body: source.slice(found.index + found[0].length, i) })
  }
  return out
}

describe('o eixo userId prende toda consulta', () => {
  const files = readdirSync(routers).filter((name) => name.endsWith('.ts'))

  it('há router sendo lido — o varredor não parou de olhar', () => {
    assert.ok(files.length >= 5, `só ${files.length} routers encontrados`)
  })

  it('nenhum `where` sem userId', () => {
    const loose: string[] = []
    let total = 0
    for (const name of files) {
      const source = codeOf(name)
      for (const { line, body } of callsOf(source, 'where')) {
        total++
        if (!/\buserId\b/.test(body)) loose.push(`${name}:${line} ${body.trim().slice(0, 60)}`)
      }
    }
    assert.ok(total >= 25, `só ${total} cláusulas where — o varredor parou de olhar`)
    assert.deepEqual(loose, [], 'consulta sem o filtro de usuário: ela devolve o dado de todo mundo, e não estoura — só mostra números que não são de quem perguntou')
  })

  it('nenhum `values` sem userId', () => {
    const loose: string[] = []
    let total = 0
    for (const name of files) {
      const source = codeOf(name)
      for (const { line, body } of callsOf(source, 'values')) {
        total++
        if (!/\buserId\b/.test(body)) loose.push(`${name}:${line}`)
      }
    }
    assert.ok(total >= 12, `só ${total} escritas — o varredor parou de olhar`)
    assert.deepEqual(loose, [], 'escrita sem o dono: a linha nasce órfã e some da leitura de quem a gravou')
  })
})
