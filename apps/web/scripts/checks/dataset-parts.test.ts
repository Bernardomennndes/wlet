import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DATASET_PARTS } from '@wlet/services'
import { body, interfaceFields, read, stripComments } from './support/source-fields'

/**
 * A lista escrita à mão que precisa acompanhar um TIPO.
 *
 * `DATASET_PARTS` decide o que é um conjunto COMPLETO: é sobre ela que o serviço calcula o que
 * está faltando e recusa publicar meio conjunto. Uma parte nova no `Dataset` que não entre nessa
 * lista não é recusada — ela deixa de ser conferida, e o serviço passa a chamar de completo um
 * conjunto que não tem tudo. Nenhuma ferramenta compara um array de strings com as chaves de uma
 * interface; o `tsc` aceita os dois lados como corretos, separadamente.
 *
 * A SEMENTE é o outro lado do mesmo problema, e ela importa mais do que o tamanho sugere: é o
 * único caminho de dado do app que não passa pelo servidor. Se ela ler quatro partes de cinco, o
 * app abre com um conjunto pela metade — e "meia semente não é semente" é justamente a regra que
 * o adapter escreve e que a lista precisa manter verdadeira.
 */
const DATASET_TYPE = 'packages/domain/src/dataset.ts'
const PIPELINE = 'packages/ingest/src/pipeline.ts'
const SEED = 'apps/web/src/lib/bundle-seed.adapter.ts'
const CONFIG_SEED = 'apps/web/src/lib/bundle-declarations.adapter.ts'
const SERVICE = 'packages/services/src/dataset/application/dataset.service.ts'

/**
 * O corpo do `return { … }` que contém uma marca — há mais de um por arquivo, e o primeiro é
 * sempre o da fábrica.
 */
function returnedObject(file: string, marker: string): string {
  const source = stripComments(read(file))
  for (const match of source.matchAll(/return \{/g)) {
    const block = body(source, match.index)
    if (block.includes(marker)) return block
  }
  throw new Error(`nenhum \`return\` com \`${marker}\` em ${file}`)
}

/** As partes que um arquivo pede ao bundle: `readGenerated<T>('nome')`. */
const requested = (file: string) => [...stripComments(read(file)).matchAll(/readGenerated<[^>]*>\('([a-z]+)'\)/g)].map((m) => m[1]).sort()

describe('a lista de partes acompanha o tipo', () => {
  it('`DATASET_PARTS` é exatamente `Dataset`', () => {
    // Nos DOIS sentidos: parte a mais na lista faz o serviço recusar um conjunto íntegro por
    // causa de algo que o tipo não tem, e a tela manda a pessoa reimportar sem nada errado.
    assert.deepEqual([...DATASET_PARTS].sort(), interfaceFields(DATASET_TYPE, 'Dataset'))
  })

  it('e é ela que o serviço usa para dizer o que falta', () => {
    // Teste de FONTE porque o comportamento não distingue: uma segunda lista escrita dentro do
    // serviço concordaria com esta hoje e divergiria na primeira parte nova — que é o defeito.
    const source = stripComments(read(SERVICE))
    assert.match(source, /DATASET_PARTS\.filter\(/, 'a conferência do que falta deixou de sair da lista')
  })
})

describe('a semente lê o conjunto INTEIRO', () => {
  it('ela pede exatamente as partes do `Dataset`', () => {
    assert.deepEqual(requested(SEED), interfaceFields(DATASET_TYPE, 'Dataset'))
  })

  it('e a guarda de "meia semente não é semente" cobre TODAS elas', () => {
    // O `if (!a || !b || …) return null` é o que impede o app de abrir com um conjunto pela
    // metade. Uma parte nova lida e esquecida na guarda passa despercebida: a semente devolve um
    // objeto com um campo `undefined`, e o estrago aparece três telas adiante.
    const guard = stripComments(read(SEED)).match(/if \(([^)]*)\) return null/)
    assert.ok(guard, 'a guarda de completude sumiu do adapter')
    for (const part of DATASET_PARTS) assert.match(guard[1], new RegExp(`\\b${part}\\b`), `a guarda não menciona \`${part}\``)
  })
})

describe('a semente da CONFIGURAÇÃO devolve as sete partes', () => {
  const declared = interfaceFields(PIPELINE, 'Declarations')

  it('nenhuma parte de `Declarations` fica de fora do objeto devolvido', () => {
    // As três que nascem vazias — `accounts`, `rules`, `selfNamePatterns` — não são lacuna: é o
    // que o pipeline espera de quem não configurou nada. Mas elas têm de ESTAR, com valor vazio;
    // ausentes, o pipeline recebe `undefined` onde espera lista e quebra na primeira iteração.
    // O objeto é extraído com contagem de chaves, e não por regex: `[^}]*` para no primeiro
    // `}` do arquivo, que é o do `return { async read() … }` da fábrica — e aí o teste acusa a
    // semente de não devolver nada, olhando para o lugar errado. Foi o primeiro vermelho aqui.
    const returned = returnedObject(CONFIG_SEED, 'planned')
    for (const part of declared) assert.match(returned, new RegExp(`\\b${part}\\b`), `\`${part}\` não é devolvida pela semente`)
  })

  it('e as quatro que vêm de arquivo são as que a guarda confere', () => {
    const fromFile = requested(CONFIG_SEED)
    assert.deepEqual(fromFile, ['budget', 'goals', 'planned', 'receivables'])
    const guard = stripComments(read(CONFIG_SEED)).match(/if \(([^)]*)\) return null/)
    assert.ok(guard)
    for (const part of fromFile) assert.match(guard[1], new RegExp(`\\b${part}\\b`), `a guarda não menciona \`${part}\``)
  })

  it('as sete partes existem mesmo — o leitor não está olhando para o vazio', () => {
    assert.equal(declared.length, 7, `só ${declared.length} partes lidas de \`Declarations\``)
  })
})
