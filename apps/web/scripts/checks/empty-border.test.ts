import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Todo `<Empty>` que é um BLOCO na tela carrega `border` no `className`.
 *
 * O componente compõe `rounded-xl border-dashed` e **não** a largura da borda
 * (`packages/ui/src/components/empty.tsx`). O preflight do Tailwind v4 zera `border-width` em todo
 * elemento, então `border-dashed` sozinho não desenha nada: o bloco fica flutuando sem moldura, e
 * nada grita — não é erro de compilação, não é warning, é só um retângulo que não aparece. É o
 * modo de falha que a §8 de `tables-and-listings.md` descreve, e a razão de ela exigir a classe.
 *
 * **Duas exceções, e as duas têm critério — não são tolerância.**
 *
 * 1. **Dentro de `<TableCell>`**: o vazio é uma LINHA da tabela (`data-table.md` §7.1), e a tabela
 *    já desenha as próprias bordas. Uma segunda, tracejada, por dentro da célula competiria com a
 *    grade em volta.
 * 2. **A página inteira**: em `nao-encontrado`, o `Empty` não é um bloco NA página, ele É a página.
 *    Uma moldura tracejada ali emolduraria a tela, não um vazio dentro dela.
 *
 * A exceção 2 é por arquivo e está declarada abaixo justamente para NÃO poder crescer em silêncio:
 * a lista é a decisão, e um `Empty` sem borda em qualquer outro lugar é defeito.
 */
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

/** O `Empty` que É a página, não um bloco nela. */
const PAGINAS_INTEIRAS = new Set(['routes/nao-encontrado/-content.tsx'])

function tsxFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsxFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`))
    else if (entry.name.endsWith('.tsx')) out.push(`${prefix}${entry.name}`)
  }
  return out
}

describe('a borda do Empty', () => {
  it('todo Empty que é bloco na tela tem `border`', () => {
    const borderless: string[] = []
    let checked = 0

    for (const relative of tsxFiles(webSrc)) {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
      for (const found of source.matchAll(/<Empty(\s[^>]*)?>/g)) {
        const props = found[1] ?? ''
        const before = source.slice(0, found.index)
        const inCell = before.lastIndexOf('<TableCell') > before.lastIndexOf('</TableCell>')
        if (inCell || PAGINAS_INTEIRAS.has(relative)) continue
        checked++
        if (!/\bborder\b/.test(props)) borderless.push(`${relative}:${before.split('\n').length}`)
      }
    }

    assert.ok(checked >= 8, `só ${checked} Empty conferidos — o varredor parou de olhar`)
    assert.deepEqual(borderless, [], 'Empty sem `border` no className: o componente só compõe `border-dashed`, e o preflight do Tailwind zera a largura — o bloco fica SEM moldura nenhuma')
  })

  it('e a exceção de página inteira aponta para arquivo que existe e não tem borda', () => {
    // Uma exceção que envelhece é pior que exceção nenhuma: ela passa a dar licença a um arquivo
    // que não precisa mais dela, ou a nenhum.
    for (const relative of PAGINAS_INTEIRAS) {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
      const found = /<Empty(\s[^>]*)?>/.exec(source)
      assert.ok(found, `${relative} não tem mais Empty — tire a exceção`)
      assert.doesNotMatch(found[1] ?? '', /\bborder\b/, `${relative} passou a ter borda — a exceção deixou de fazer sentido`)
    }
  })
})
