import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Toda tela tem UM `<h1>`, e é o nome dela.
 *
 * Navegar por títulos é como se varre uma página com leitor de tela, e uma tela sem `<h1>` não
 * aparece nessa varredura — a pessoa cai no começo do documento e tateia. Não havia sinal nenhum:
 * o `tsc` não tem opinião sobre heading, e o lint de a11y não roda sobre estes arquivos.
 *
 * **Duas telas quase escaparam pelo mesmo buraco**, e é por isso que o teste conta em vez de só
 * procurar: `CardTitle` e `EmptyTitle` são `<div>` e não aceitam `render`, então parecem título e
 * não são. A rota 404 já resolvia pondo o `<h1>` DENTRO do slot; a tela de entrada não — a primeira
 * página que qualquer pessoa vê era a única do app sem heading nenhum.
 *
 * **O teste exige PELO MENOS um, e não exatamente um** — e a diferença foi medida. `patrimonio` tem
 * dois `<h1>` no arquivo, em ramos mutuamente exclusivos: o retorno adiantado de "nenhum relatório de
 * investimentos" e o render principal. Só um renderiza. Exigir exatamente um acusaria aquele arquivo,
 * que está certo, e um sensor que acusa código certo é um sensor que alguém desliga. Distinguir os
 * dois casos exigiria seguir o fluxo, que a leitura de fonte não faz — então o teste tranca o defeito
 * que realmente aconteceu (tela SEM heading nenhum) e não finge cobrir o outro.
 *
 * Os comentários são removidos antes da contagem: dois arquivos EXPLICAM o `<h1>` que puseram dentro
 * do slot, e procurar na explicação dá o número errado — a primeira versão deste teste caiu nisso.
 */
const routes = fileURLToPath(new URL('../../src/routes/', import.meta.url))

/** Todo `-content.tsx`: o da raiz e o de cada rota. */
function contentFiles(): string[] {
  const out = ['-content.tsx']
  for (const entry of readdirSync(routes, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== '-components') out.push(`${entry.name}/-content.tsx`)
  }
  return out.filter((relative) => {
    try {
      readFileSync(`${routes}${relative}`, 'utf8')
      return true
    } catch {
      return false
    }
  })
}

describe('o heading de cada tela', () => {
  const files = contentFiles()

  it('há uma tela por rota — o varredor não parou de olhar', () => {
    assert.ok(files.length >= 14, `só ${files.length} telas encontradas`)
  })

  for (const relative of files) {
    it(`${relative}: tem <h1>`, () => {
      const source = readFileSync(`${routes}${relative}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const headings = [...source.matchAll(/<h1[\s>]/g)].length
      assert.ok(
        headings >= 1,
        'tela sem <h1>: ela não aparece na navegação por títulos, e `CardTitle`/`EmptyTitle` são <div> que só PARECEM título — ponha o <h1> DENTRO do slot, como a rota 404 e a de entrada fazem',
      )
    })
  }
})
