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
const SHAPE = 'packages/api/src/domains/dataset/shape.ts'

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

/** Só as chaves do PRIMEIRO nível: o que está aninhado é forma de um campo, não campo. */
function topLevelKeys(block: string): string[] {
  const keys: string[] = []
  let depth = 0
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (depth === 0) {
      // A forma ABREVIADA conta como campo: `entity,` no Zod é o mesmo que `entity: entity`, e
      // ignorá-la fez este teste acusar uma divergência que não existia — o `entity` estava nos
      // dois lados, e só o leitor não o via. Um sensor que erra assim é desligado na primeira vez.
      const match = trimmed.match(/^([A-Za-z_][\w$]*)\??\s*[:,]/)
      if (match) keys.push(match[1])
    }
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
  }
  return keys.sort()
}

const domainFields = (name: string) => {
  const source = stripComments(read(TYPES))
  const at = source.indexOf(`export interface ${name} {`)
  assert.notEqual(at, -1, `${name} sumiu do domínio`)
  return topLevelKeys(body(source, at))
}

const wireFields = (name: string) => {
  const source = stripComments(read(SHAPE))
  const at = source.indexOf(`export const ${name} = z.object(`)
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

describe('o dataset do fio carrega as cinco partes', () => {
  it('nenhuma parte do conjunto ficou de fora do contrato', () => {
    // `dataset` é o envelope: se uma parte sumir dele, o `GET /dataset` devolve um conjunto
    // incompleto e o serviço o recusa — a tela abre pela semente sem explicar por quê.
    assert.deepEqual(wireFields('dataset'), ['accounts', 'investments', 'meta', 'transactions', 'transfers'])
  })
})
