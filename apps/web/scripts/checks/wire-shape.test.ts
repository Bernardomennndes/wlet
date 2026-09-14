import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Um campo que o DOMÍNIO tem e o CONTRATO não é dado que some no fio, em silêncio.
 *
 * O `shape.ts` do contrato afirma que a junção é a do compilador: `os.router` é
 * `implement(wletContract)`, então um campo que mude ali quebra o handler antes de qualquer
 * requisição. Isso vale numa direção só, e é a direção MENOS provável — mexer no contrato.
 *
 * Na outra, nada acontece. Um campo acrescentado ao `Transaction` do domínio e esquecido aqui não
 * quebra compilação nenhuma: a checagem de propriedade excedente do TypeScript só vale para
 * literal, o handler devolve objeto montado, e o Zod **descarta chave desconhecida na saída sem
 * dizer nada**. O lançamento atravessa sem o campo, a tela lê `undefined`, e a origem disso está
 * a três camadas de distância.
 *
 * É o modo de falha que este projeto já conhece de outro ângulo — foi um `as never` que segurou o
 * `amountBetween` divergindo entre contrato e domínio. Aqui a divergência nem precisa de cast.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const read = (relative: string) => readFileSync(`${repoRoot}${relative}`, 'utf8')

const TYPES = 'packages/domain/src/types.ts'
const PIPELINE = 'packages/ingest/src/pipeline.ts'
const DATASET_SHAPE = 'packages/api/src/domains/dataset/shape.ts'
const CONFIG_SHAPE = 'packages/api/src/domains/config/shape.ts'

/** Sem comentário: um bloco de documentação que cite um nome de campo seria lido como campo. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** O corpo de uma declaração, do primeiro `{` até a chave que o fecha. */
function body(source: string, start: number): string {
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error('chave não fechada')
}

/**
 * Só as chaves do PRIMEIRO nível: o que está aninhado é forma de um campo, não campo.
 *
 * A separação é por VÍRGULA de profundidade zero e não por linha, e a diferença apareceu no
 * `goal`, que o contrato escreve numa linha só. Um leitor por linha devolvia zero campos ali —
 * e zero campos comparado com zero campos fecha, que é o jeito mais silencioso de um sensor
 * deixar de olhar.
 */
function topLevelKeys(block: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of block) {
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    // Vírgula E quebra de linha separam: o Zod escreve `a: x, b: y` (às vezes numa linha só) e a
    // interface do TypeScript escreve um campo por linha, sem vírgula. Um separador só cobre um
    // dos dois — e foi assim que a primeira versão deste leitor devolveu zero campo para as três
    // interfaces do domínio depois de eu consertá-lo para o `goal` do contrato.
    if ((ch === ',' || ch === '\n') && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)

  const keys: string[] = []
  for (const part of parts) {
    // A forma ABREVIADA conta como campo: `entity` no Zod é o mesmo que `entity: entity`.
    const match = part.trim().match(/^([A-Za-z_][\w$]*)\s*\??\s*(:|$)/)
    if (match) keys.push(match[1])
  }
  return keys.sort()
}

const domainFields = (name: string, file = TYPES) => {
  const source = stripComments(read(file))
  const at = source.indexOf(`export interface ${name} {`)
  assert.notEqual(at, -1, `${name} sumiu do domínio`)
  return topLevelKeys(body(source, at))
}

const wireFields = (name: string, file = DATASET_SHAPE) => {
  const source = stripComments(read(file))
  // Sem o `export`: `matchRule` e `dueOn` são internos ao módulo do contrato e viajam dentro dos
  // outros. Não serem exportados não os torna menos parte do fio.
  const at = source.search(new RegExp(`(?:export )?const ${name} = z\\.object\\(`))
  assert.notEqual(at, -1, `${name} sumiu do contrato`)
  return topLevelKeys(body(source, at))
}

/** Os três que viajam inteiros, do domínio para o fio. */
const MIRRORED: [domain: string, wire: string][] = [
  ['Transaction', 'transaction'],
  ['Account', 'account'],
  ['Transfer', 'transfer'],
]

describe('o contrato espelha o domínio, campo a campo', () => {
  it('o leitor está achando os dois lados', () => {
    // Uma extração que devolve lista vazia faria as comparações abaixo passarem por vacuidade —
    // e é o modo de falha mais provável de um teste que lê fonte.
    for (const [domain, wire] of MIRRORED) {
      assert.ok(domainFields(domain).length >= 5, `${domain}: só ${domainFields(domain).length} campos lidos`)
      assert.ok(wireFields(wire).length >= 5, `${wire}: só ${wireFields(wire).length} campos lidos`)
    }
  })

  for (const [domain, wire] of MIRRORED) {
    it(`\`${domain}\` e \`${wire}\` têm os MESMOS campos`, () => {
      // Comparação nos dois sentidos de propósito. Campo só no domínio some no fio; campo só no
      // contrato é pior — o handler precisa preenchê-lo e não tem de onde, e a validação de saída
      // recusa a resposta inteira, que é o incidente do orçamento `{}` outra vez.
      assert.deepEqual(wireFields(wire), domainFields(domain))
    })
  }
})

/**
 * A configuração: a superfície onde a divergência JÁ ACONTECEU.
 *
 * `amountBetween` era `z.tuple([number, number])` no contrato e `{ min?, max? }` no domínio, e a
 * configuração real usa `{ min: 200 }` — sem máximo, porque um rateio varia mês a mês. Uma tupla
 * não representa isso. O defeito ficou invisível por um `as never` no adapter do cliente; tirado o
 * cast, ele apareceu no typecheck. Este espelho é o que dispensa o typecheck de ser a única
 * chance — ele acusa mesmo que um cast novo volte a esconder.
 */
const CONFIG_MIRRORED: [domain: string, wire: string, file?: string][] = [
  ['PlannedEntry', 'plannedEntry'],
  ['Receivable', 'receivable'],
  ['BudgetItem', 'budgetItem'],
  ['Budget', 'budget'],
  ['Goal', 'goal'],
  ['MatchRule', 'matchRule'],
  ['AccountProfile', 'accountProfile', PIPELINE],
]

describe('a configuração declarada também espelha o domínio', () => {
  it('o leitor está achando os dois lados', () => {
    for (const [domain, wire, file] of CONFIG_MIRRORED) {
      assert.ok(domainFields(domain, file ?? TYPES).length >= 3, `${domain}: só ${domainFields(domain, file ?? TYPES).length} campos lidos`)
      assert.ok(wireFields(wire, CONFIG_SHAPE).length >= 3, `${wire}: só ${wireFields(wire, CONFIG_SHAPE).length} campos lidos`)
    }
  })

  for (const [domain, wire, file] of CONFIG_MIRRORED) {
    it(`\`${domain}\` e \`${wire}\` têm os MESMOS campos`, () => {
      assert.deepEqual(wireFields(wire, CONFIG_SHAPE), domainFields(domain, file ?? TYPES))
    })
  }

  it('e a RUBRICA, que viaja INLINE, não perdeu campo', () => {
    // `BudgetCategory` não tem forma nomeada no contrato: ela é escrita dentro do `byCategory`.
    // Por isso fica fora do espelho acima e ganha esta checagem própria — sem ela, o único campo
    // do domínio que não é conferido seria justamente o que a composição de uma rubrica usa.
    const source = stripComments(read(CONFIG_SHAPE))
    const at = source.indexOf('byCategory:')
    assert.notEqual(at, -1, 'o `byCategory` mudou de nome')
    const inline = topLevelKeys(body(source, source.indexOf('z.object(', at)))
    assert.deepEqual(inline, domainFields('BudgetCategory'))
  })
})

describe('o dataset do fio carrega as cinco partes', () => {
  it('nenhuma parte do conjunto ficou de fora do contrato', () => {
    // `dataset` é o envelope: se uma parte sumir dele, o `GET /dataset` devolve um conjunto
    // incompleto e o serviço o recusa — a tela abre pela semente sem explicar por quê.
    assert.deepEqual(wireFields('dataset'), ['accounts', 'investments', 'meta', 'transactions', 'transfers'])
  })
})
