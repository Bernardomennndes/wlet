import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { body, interfaceFields, pgTableColumns, stripComments, topLevelKeys, zodObjectFields } from './support/source-fields'

/**
 * O TESTE DO LEITOR DE FONTE — a peça em que dezoito sensores se apoiam, e que não tinha um.
 *
 * `topLevelKeys` é o que transforma um bloco de código em lista de campos, e dela saem os espelhos
 * que sustentam a migração: domínio ↔ contrato (`wire-shape`), contrato ↔ coluna (`db-columns`),
 * e as partes do conjunto (`dataset-parts`). O próprio docblock dela registra duas ocasiões em que
 * ela devolveu ZERO CAMPOS — e a frase que importa é a última: "nenhuma das duas vezes o teste ficou
 * vermelho sozinho".
 *
 * A razão era aritmética: um espelho compara duas listas, e duas listas VAZIAS são iguais.
 *
 * **Medido antes de escrever, e o resultado corrigiu a premissa deste arquivo.** Reintroduzi os dois
 * defeitos e hoje eles NÃO passam em silêncio: deixam 25 e 27 sensores vermelhos. As guardas de
 * alcance acrescentadas desde então — o "o leitor está achando os dois lados" que `wire-shape`,
 * `db-columns` e `dataset-parts` carregam — já cobrem a vacuidade.
 *
 * O que este arquivo acrescenta, então, não é a DETECÇÃO: é o DIAGNÓSTICO. Vinte e cinco espelhos
 * vermelhos dizem que alguma coisa está errada e mandam procurar entre domínio, contrato e coluna;
 * um vermelho em "o Zod numa linha só, separado por VÍRGULA" diz onde está, na primeira linha da
 * saída. A diferença é o tempo de quem lê o erro — e, numa camada em que a falha é rara, quem lê
 * não tem o contexto fresco.
 *
 * Os dois casos que o quebraram estão aqui como os dois primeiros testes, com o formato exato que
 * cada um tem no repositório.
 */
describe('as duas formas que já quebraram o leitor', () => {
  it('o Zod numa linha só, separado por VÍRGULA', () => {
    // A forma do `goal` no contrato. A primeira versão separava só por quebra de linha e devolvia
    // zero campos para ele — e o espelho contra o domínio passou, comparando vazio com vazio.
    assert.deepEqual(topLevelKeys('id: z.string(), label: z.string(), target: z.number()'), ['id', 'label', 'target'])
  })

  it('e a interface do TypeScript, um campo por LINHA e sem vírgula', () => {
    // A forma das interfaces do domínio. Consertado para vírgula, o leitor passou a devolver zero
    // para as três — o mesmo defeito com o sinal trocado, e de novo sem ninguém vermelho.
    assert.deepEqual(topLevelKeys('  id: string\n  label: string\n  amount?: number\n'), ['amount', 'id', 'label'])
  })
})

describe('o que é campo e o que é FORMA de um campo', () => {
  it('o que está aninhado não vaza para a lista', () => {
    // A regra que dá nome à função: `financed` é um campo, e `total`/`installments` são a forma
    // dele. Vazassem, o espelho contra a coluna acusaria campos que a tabela não tem — e a
    // "correção" seria criar colunas para o que já viaja achatado.
    assert.deepEqual(topLevelKeys('id: z.string(), financed: z.object({ total: z.number(), installments: z.number() }), status: z.string()'), ['financed', 'id', 'status'])
  })

  it('a forma ABREVIADA conta como campo', () => {
    // `{ entity }` no Zod é o mesmo que `entity: entity`. Ignorá-la faria o campo sumir do espelho
    // e a migração parecer completa sem ele.
    assert.deepEqual(topLevelKeys('id: z.string(),\n  entity,\n  label: z.string()'), ['entity', 'id', 'label'])
  })

  it('e a união num campo só não se parte', () => {
    // `dueOn` é uma união discriminada escrita com `|` e chaves aninhadas. O contador de
    // profundidade é o que a mantém inteira.
    assert.deepEqual(topLevelKeys("dueOn: z.union([z.object({ kind: z.literal('day'), day: z.number() }), z.object({ kind: z.literal('business-day'), nth: z.number() })]), id: z.string()"), [
      'dueOn',
      'id',
    ])
  })
})

describe('o COMENTÁRIO não é campo', () => {
  it('um campo citado em comentário não entra na lista', () => {
    // Todo docblock deste repositório nomeia campos em prosa. Sem a limpeza, `wire-shape` acusaria
    // o domínio de ter campos que só existem no texto que os explica.
    const block = stripComments('/** O `note` aqui é só prosa. */\n  id: string\n  // e o `label` também\n  amount: number\n')
    assert.deepEqual(topLevelKeys(block), ['amount', 'id'])
  })
})

describe('a forma que NÃO existe estoura, em vez de devolver vazio', () => {
  /**
   * A guarda que impede o modo de falha descrito no topo, e ela é a razão de estes três lançarem
   * em vez de devolverem `[]`: renomear uma forma sem atualizar o sensor precisa QUEBRAR. Com uma
   * lista vazia, o espelho passaria e a renomeação levaria junto a garantia.
   */
  const contrato = 'packages/api/src/domains/plans/shape.ts'

  it('`zodObjectFields` lança quando a forma sumiu', () => {
    assert.throws(() => zodObjectFields(contrato, 'formaQueNaoExiste'), /não existe/)
  })

  it('`interfaceFields` lança quando a interface sumiu', () => {
    assert.throws(() => interfaceFields('packages/domain/src/types.ts', 'InterfaceQueNaoExiste'), /não existe/)
  })

  it('`pgTableColumns` lança quando a tabela sumiu', () => {
    assert.throws(() => pgTableColumns('packages/db/src/schema/declarations.ts', 'tabelaQueNaoExiste'), /não existe/)
  })

  it('e `body` lança quando a chave não fecha', () => {
    assert.throws(() => body('const x = { a: 1', 10), /chave não fechada/)
  })
})

describe('e sobre o repositório de verdade ele lê o que se espera', () => {
  it('as três leituras devolvem listas NÃO VAZIAS', () => {
    // A guarda de alcance, aqui aplicada ao próprio leitor: se ele voltar a devolver vazio, é este
    // teste que fica vermelho — e não dezoito sensores que seguem verdes sem ler nada.
    const fromZod = zodObjectFields('packages/api/src/domains/plans/shape.ts', 'plan')
    const fromInterface = interfaceFields('packages/domain/src/types.ts', 'Plan')
    const fromTable = pgTableColumns('packages/db/src/schema/declarations.ts', 'plans')

    for (const [name, list] of [
      ['zodObjectFields', fromZod],
      ['interfaceFields', fromInterface],
      ['pgTableColumns', fromTable],
    ] as const) {
      assert.ok(list.length >= 5, `${name} leu só ${list.length} campos — o leitor está quebrado`)
    }
    assert.ok(fromZod.includes('purchaseId') && fromInterface.includes('purchaseId') && fromTable.includes('purchaseId'), 'o campo mais recente é lido pelas três')
  })
})
