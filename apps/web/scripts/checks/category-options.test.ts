import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { CATEGORIES, categoryOptions, expenseCategoryOptions } from '@wlet/domain'

/**
 * As opções de categoria saem de `@wlet/domain`, não de um `.map()` na tela.
 *
 * A §5 de `enum-display.md` manda a derivação morar NO ARQUIVO DO DOMÍNIO. Estava escrita SETE vezes,
 * em sete telas, com a mesma forma — e nada obrigava as sete a andarem juntas.
 *
 * Ainda não tinham divergido, e é por isso que este arquivo existe agora e não depois: a divergência
 * seria SILENCIOSA. O `AppCombobox` casa a busca contra rótulo MAIS descrição, então a cópia que
 * esquecesse `description` deixaria de encontrar "Mercado" por "padaria" — e a tela pareceria apenas
 * ter menos resultados, sem erro nenhum. É o mesmo defeito dos mapas paralelos da §1, com outra
 * roupa: em vez de duas estruturas para o mesmo enum, sete derivações da mesma lista.
 *
 * O sentinela de "todas" continua sendo da TELA, e a §5 o proíbe na lista de domínio: `transacoes`
 * o acrescenta por spread. Por isso o teste procura o `.map()`, não o spread.
 */
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

function sourceFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...sourceFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`))
    else if (/\.tsx?$/.test(entry.name)) out.push(`${prefix}${entry.name}`)
  }
  return out
}

describe('as opções de categoria vêm do domínio', () => {
  it('nenhuma tela mapeia CATEGORIES para objeto de opção', () => {
    const offenders: string[] = []
    for (const relative of sourceFiles(webSrc)) {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      // `CATEGORIES` seguido de `.map(` até 80 caracteres — cobre o `.filter(…).map(…)` também.
      for (const found of source.matchAll(/\bCATEGORIES\b[\s\S]{0,80}?\.map\(/g)) {
        offenders.push(`${relative}:${source.slice(0, found.index).split('\n').length}`)
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'derivação de opções na tela (§5 de enum-display.md): use `categoryOptions`/`expenseCategoryOptions` de `@wlet/domain`. Uma cópia que esqueça `description` piora a busca do combobox em silêncio',
    )
  })

  it('e as duas listas cobrem o catálogo, com descrição em todas', () => {
    assert.equal(categoryOptions.length, CATEGORIES.length)
    assert.ok(
      categoryOptions.every((option) => option.description.length > 0),
      'opção sem descrição: a busca do combobox perde o desempate',
    )
    assert.equal(expenseCategoryOptions.length, CATEGORIES.filter((category) => category.kind === 'expense').length)
    assert.ok(expenseCategoryOptions.length > 0 && expenseCategoryOptions.length < categoryOptions.length, 'a lista de despesa é um subconjunto próprio')
  })

  it('e a lista de domínio NÃO carrega o sentinela de "todas"', () => {
    // A §5 o proíbe: o sentinela é decisão de quem filtra, e dentro da lista ele vira uma categoria
    // que um seletor de formulário ofereceria como valor válido.
    assert.ok(!categoryOptions.some((option) => option.value === 'all' || option.value === ''), 'sentinela dentro da lista de domínio')
  })
})
