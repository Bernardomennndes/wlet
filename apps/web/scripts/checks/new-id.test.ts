import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { newId } from '@wlet/domain'

/**
 * Id novo vem de `newId`, nunca do TAMANHO da lista.
 *
 * `conta-${lista.length + 1}` parece seguro e não é. O gesto que o quebra é comum: acrescentar
 * três, remover o do meio, acrescentar de novo — a lista volta a ter dois, e o id gerado é o do
 * terceiro, que ainda está lá. Medido, e estava em QUATRO seções da Configuração: contas,
 * cobranças, metas e regras.
 *
 * O que acontece depois depende de haver validação, e as duas saídas são ruins de jeitos
 * diferentes. Em cobranças, `assertSchedulable` recusa a gravação inteira — a pessoa clicou em
 * "Adicionar cobrança" e leu "Há cobranças com o mesmo id", sobre um id que ela nunca viu. Nas
 * outras três não há validação nenhuma: os dois itens ficam, a edição de um muda os dois e a
 * remoção apaga os dois, em silêncio.
 *
 * O relógio sozinho também não basta — 200 chamadas no mesmo tique davam UM id distinto —, e é
 * por isso que `newId` leva sufixo aleatório. Os dois testes abaixo cobrem as duas armadilhas.
 */
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

function tsxFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsxFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`))
    else if (/\.tsx?$/.test(entry.name)) out.push(`${prefix}${entry.name}`)
  }
  return out
}

describe('id novo não sai do tamanho da lista', () => {
  it('nenhum id montado a partir de `.length`', () => {
    const offenders: string[] = []
    for (const relative of tsxFiles(webSrc)) {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      // `id:` seguido de um template que lê `.length` — a forma exata que colidia.
      for (const found of source.matchAll(/\bid:\s*`[^`]*\$\{[^}]*\.length[^}]*\}[^`]*`/g)) {
        offenders.push(`${relative}:${source.slice(0, found.index).split('\n').length}`)
      }
    }
    assert.deepEqual(offenders, [], 'id derivado do tamanho da lista: remover um item do meio faz o próximo id colidir com um que ficou. Use `newId(prefixo)` de `@wlet/domain`')
  })

  it('e `newId` não colide dentro do mesmo milissegundo', () => {
    // O relógio puro dava 1 distinto em 200. É o sufixo aleatório que faz a diferença.
    const ids = new Set(Array.from({ length: 200 }, () => newId('x')))
    assert.equal(ids.size, 200)
  })

  it('e mantém o prefixo legível, que é o que se lê num dado gravado', () => {
    assert.match(newId('conta'), /^conta-/)
  })
})
