import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Ler CAMPO de fonte — uma implementação só, para as duas pontas da travessia.
 *
 * `wire-shape.test.ts` compara domínio com contrato; `db-columns.test.ts` compara contrato com
 * banco. Os dois precisam extrair as chaves de primeiro nível de uma declaração, e duas cópias
 * deste leitor divergiriam no primeiro ajuste — que é exatamente o defeito que esses dois
 * sensores existem para pegar. Seria irônico o bastante para valer o arquivo.
 *
 * O leitor já errou duas vezes, e as duas ficaram escritas aqui porque são o modo de falha de
 * quem lê fonte: ele deixa de enxergar em silêncio, e zero comparado com zero fecha.
 */
export const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url))

export const read = (relative: string) => readFileSync(`${repoRoot}${relative}`, 'utf8')

/** Sem comentário: um bloco de documentação que cite um nome de campo seria lido como campo. */
export const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** O corpo de uma declaração, do primeiro `{` depois de `from` até a chave que o fecha. */
export function body(source: string, from: number): string {
  const open = source.indexOf('{', from)
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
 * Separa por VÍRGULA e por QUEBRA DE LINHA, e os dois são necessários: o Zod escreve
 * `a: x, b: y` — às vezes numa linha só, como o `goal` do contrato — e a interface do TypeScript
 * escreve um campo por linha, sem vírgula. A primeira versão separava só por linha e devolvia
 * zero campos para o `goal`; consertada para vírgula, passou a devolver zero para as três
 * interfaces do domínio. Nenhuma das duas vezes o teste ficou vermelho sozinho.
 */
export function topLevelKeys(block: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of block) {
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
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

/** Os campos de uma `interface` do domínio. */
export function interfaceFields(file: string, name: string): string[] {
  const source = stripComments(read(file))
  const at = source.indexOf(`export interface ${name} {`)
  if (at === -1) throw new Error(`interface ${name} não existe em ${file}`)
  return topLevelKeys(body(source, at))
}

/**
 * Os campos de um `z.object` do contrato.
 *
 * Sem exigir `export`: `matchRule` e `dueOn` são internos ao módulo e viajam dentro dos outros.
 * Não serem exportados não os torna menos parte do fio.
 */
export function zodObjectFields(file: string, name: string): string[] {
  const source = stripComments(read(file))
  const at = source.search(new RegExp(`(?:export )?const ${name} = z\\.object\\(`))
  if (at === -1) throw new Error(`forma ${name} não existe em ${file}`)
  return topLevelKeys(body(source, at))
}

/** As colunas de uma tabela do Drizzle — o segundo argumento de `pgTable`. */
export function pgTableColumns(file: string, table: string): string[] {
  const source = stripComments(read(file))
  const at = source.search(new RegExp(`export const ${table} = pgTable\\(`))
  if (at === -1) throw new Error(`tabela ${table} não existe em ${file}`)
  // O primeiro `{` depois do NOME da tabela: `pgTable('plans', { ...colunas })`.
  return topLevelKeys(body(source, source.indexOf(',', at)))
}
