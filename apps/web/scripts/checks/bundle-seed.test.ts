import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { read, stripComments } from './support/source-fields'

/**
 * "MEIA SEMENTE NÃO É SEMENTE" — a regra dos dois adapters de bundle, e por que o teste é de FONTE.
 *
 * Eles leem os JSON que o `pnpm ingest` gravou e servem de ponto de partida para quem abre o app
 * sem nada no servidor. A regra que os governa está escrita em um dos dois e vale para os dois: "um
 * conjunto sem `meta` não tem meses, e sem meses as telas não sabem o que desenhar. Ou vieram os
 * cinco, ou não veio nada."
 *
 * **Por que fonte, e não comportamento.** O caminho feliz é inalcançável pelo runner por decisão de
 * projeto: `generated-files.ts` chama `import.meta.glob` no TOPO do módulo, e fora do Vite isso
 * estoura — o que é justamente o que faz a semente ser opcional e o build sobreviver a um
 * `src/generated/` apagado. Os adapters embrulham o `import()` num `try/catch` por causa disso, e o
 * medidor mostra o resultado: 41% e 47% de linhas, com só o `catch` rodando. Alcançá-lo exigiria
 * `--experimental-test-module-mocks` no `check`, e mudar a configuração da suíte para cobrir dois
 * arquivos é trocar um problema por outro maior.
 *
 * O que ESTE teste pega é a deriva real: alguém acrescenta uma sexta peça ao conjunto, escreve o
 * `readGenerated` dela, e esquece de somá-la à guarda do tudo-ou-nada. A semente passa a voltar
 * parcial, o app abre com um conjunto que parece bom, e a peça que falta some sem nada avisar.
 */
const ADAPTERS = ['apps/web/src/lib/bundle-seed.adapter.ts', 'apps/web/src/lib/bundle-declarations.adapter.ts'] as const

/** Os nomes pedidos ao `readGenerated`, e as variáveis que os recebem, na ordem da desestruturação. */
function seedOf(file: string) {
  const source = stripComments(read(file))
  const names = [...source.matchAll(/readGenerated<[^>]*>\('([^']+)'\)/g)].map((m) => m[1])
  const destructured = source.match(/const \[([^\]]+)\] = await Promise\.all/)?.[1]
  const guard = source.match(/if \(([^)]*)\) return null/)?.[1]
  // O ÚLTIMO `return { … }` do arquivo, e não o primeiro: o primeiro é o da FÁBRICA
  // (`return { async read() … }`), que não tem peça nenhuma. Foi o que a primeira versão pegou.
  const returned = [...source.matchAll(/return \{([^}]*)\}/g)].at(-1)?.[1]
  return { source, names, vars: (destructured ?? '').split(',').map((v) => v.trim()), guard: guard ?? '', returned: returned ?? '' }
}

describe('ou vieram todas as peças, ou não veio nenhuma', () => {
  for (const file of ADAPTERS) {
    const name = file.split('/').pop()

    it(`${name}: toda peça lida entra na guarda do tudo-ou-nada`, () => {
      // A guarda é um `||` de negações. Uma peça fora dela é uma peça que pode voltar `null` sem
      // impedir a semente de ser servida — e o `Promise.all` não ajuda: ele resolve com `null`
      // dentro, não rejeita.
      const { vars, guard } = seedOf(file)
      assert.ok(vars.length >= 4, `esperava as peças desestruturadas em ${name}, achei ${vars.length}`)
      assert.deepEqual(
        vars.filter((v) => !new RegExp(`!\\s*${v}\\b`).test(guard)),
        [],
        'acrescente a peça nova à guarda `if (!a || !b || …) return null`',
      )
    })

    it(`${name}: e toda peça lida chega ao objeto devolvido`, () => {
      // O outro lado: uma peça buscada e não devolvida gasta uma leitura e some. O `Promise.all`
      // esconde isso porque a ordem da desestruturação é posicional — acrescentar no meio desloca
      // tudo depois, e o erro aparece como campo com o conteúdo do vizinho.
      const { vars, returned } = seedOf(file)
      assert.deepEqual(
        vars.filter((v) => !new RegExp(`\\b${v}\\b`).test(returned)),
        [],
      )
    })

    it(`${name}: a falha do \`import()\` devolve null, e não propaga`, () => {
      // É o caminho que o runner de fato exercita, e ele precisa continuar existindo: sem o
      // `try/catch`, importar o barrel de serviços num teste estouraria — que é exatamente o que o
      // docblock de `generated-files.ts` diz ter acontecido.
      const { source } = seedOf(file)
      assert.match(source, /catch\s*\{[^}]*return null/s, 'sem semente é estado previsto, não falha')
      assert.match(source, /await import\(/, 'e o import precisa ser DINÂMICO, senão o topo do módulo estoura fora do Vite')
    })
  }
})

describe('o que a semente de declarações NÃO inventa', () => {
  it('`accounts`, `rules` e `selfNamePatterns` nascem VAZIOS', () => {
    // O docblock explica cada um, e o terceiro é o que tem consequência de dado: "sem nome próprio,
    // nenhuma transferência é reconhecida como sua — e inventar um nome casaria a transferência de
    // outra pessoa". Semear qualquer um dos três com palpite é pior que semear com nada.
    const { returned } = seedOf('apps/web/src/lib/bundle-declarations.adapter.ts')
    for (const field of ['accounts', 'rules', 'selfNamePatterns']) {
      assert.match(returned, new RegExp(`${field}:\\s*\\[\\]`), `${field} precisa nascer vazio`)
    }
  })
})
