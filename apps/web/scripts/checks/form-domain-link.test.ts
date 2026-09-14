import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * O primeiro elo da cadeia: o formulário sai no tipo do DOMÍNIO, e é o compilador que garante.
 *
 * A cadeia de um dado é formulário → domínio → contrato → banco. As duas emendas de baixo têm
 * sensor próprio (`wire-shape` e `db-columns`); esta é a de cima, e ela já está resolvida — de um
 * jeito melhor do que um teste: a `.transform()` do schema declara o tipo do domínio como RETORNO,
 * então mudar `PlannedEntry` quebra no `tsc`, na hora, no arquivo do formulário.
 *
 * O que este sensor protege é a GARANTIA, não o campo. Tirar a anotação não quebra nada e não
 * parece perda: o Zod infere a forma, o formulário continua compilando, e o elo deixa de existir
 * em silêncio — a partir dali o formulário pode passar a coletar um campo que não tem para onde ir,
 * ou parar de entregar um que o domínio exige, e o `tsc` não tem mais o que comparar.
 *
 * É o mesmo raciocínio do `single-origin`: a migração está feita, e o que falta é o que impede o
 * desfazimento silencioso.
 */
const SCHEMAS = 'apps/web/src/routes'

/** Schema de formulário que NÃO produz objeto de domínio, e por quê. */
const NOT_DOMAIN: Record<string, string> = {
  'dados/-components/import-dialog-schema.ts': 'escolha de arquivo e confirmação: o que sai é um `File`, não dado do domínio',
  'entrar/-components/entrar-form-schema.ts': 'credencial: e-mail e senha atravessam para o Better Auth, que não é domínio do WLET',
}

function schemaFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (/-schema\.ts$/.test(entry.name)) out.push(relative)
    }
  }
  walk(`${SCHEMAS}/`, '')
  return out
}

/** Cada `.transform(` do arquivo, e o tipo de retorno anotado nele — `null` quando não há. */
function transforms(source: string): (string | null)[] {
  const out: (string | null)[] = []
  for (const at of [...source.matchAll(/\.transform\(/g)].map((m) => m.index)) {
    const rest = source.slice(at)
    // Anotado é `.transform((valores): Tipo => …`, com a quebra de linha permitida entre os dois:
    // o `group-dialog-schema` escreve o parâmetro numa linha e o tipo na seguinte.
    const annotated = rest.match(/^\.transform\(\s*\([^)]*\)\s*:\s*([^=]+?)\s*=>/)
    out.push(annotated ? annotated[1].trim() : null)
  }
  return out
}

describe('o formulário entrega o tipo do domínio', () => {
  const files = schemaFiles()

  it('há schema de formulário sendo lido', () => {
    // Um varredor que não acha nada faria tudo abaixo passar por vacuidade — e o glob é frágil
    // de propósito (`-schema.ts`), porque é a convenção do repositório.
    assert.ok(files.length >= 5, `só ${files.length} schemas encontrados`)
    assert.ok(files.filter((file) => transforms(stripComments(read(`${SCHEMAS}/${file}`))).length > 0).length >= 3, 'nenhum `.transform` encontrado')
  })

  it('toda `.transform` declara o tipo de RETORNO', () => {
    // Sem a anotação o Zod infere, o arquivo compila, e o compilador deixa de ser o juiz.
    const bare: string[] = []
    for (const file of files) {
      transforms(stripComments(read(`${SCHEMAS}/${file}`))).forEach((type, index) => {
        if (type === null) bare.push(`${file} (transform #${index + 1})`)
      })
    }
    assert.deepEqual(bare, [], '`.transform` sem tipo de retorno: o elo formulário → domínio deixa de ser verificado')
  })

  it('e o tipo anotado vem do DOMÍNIO', () => {
    // Anotar com um tipo local devolve a aparência da garantia sem a garantia: o formulário passa
    // a concordar com uma forma que só ele conhece, e a divergência com o domínio volta a ser
    // possível — que é o estado anterior ao `.transform`, com um passo a mais de disfarce.
    const wrong: string[] = []
    for (const file of files) {
      const source = stripComments(read(`${SCHEMAS}/${file}`))
      // O import do domínio tem DUAS formas no repositório — `import type { X }` e
      // `import { algo, type X }` — e só a primeira estava sendo lida: o sensor acusou três
      // arquivos certos. Lê-se o bloco inteiro e tira-se o `type` de cada nome.
      const domainImports = [...source.matchAll(/import (?:type )?\{([^}]+)\} from '@wlet\/domain(?:\/[a-z]+)?'/g)].flatMap((m) =>
        m[1].split(',').map((name) => name.replace(/^\s*type\s+/, '').trim()),
      )
      for (const type of transforms(source)) {
        if (type === null) continue
        // `Omit<PlanGroup, 'id'>` conta: o que importa é o tipo por baixo.
        const named = type.match(/[A-Z][\w$]*/g) ?? []
        if (!named.some((name) => domainImports.includes(name))) wrong.push(`${file}: ${type}`)
      }
    }
    assert.deepEqual(wrong, [])
  })

  it('schema sem `.transform` é DECLARADO, e o motivo não sobrevive ao arquivo', () => {
    // A lista fechada é o que faz um schema novo sem transform aparecer, em vez de entrar calado.
    const bare = files.filter((file) => transforms(stripComments(read(`${SCHEMAS}/${file}`))).length === 0)
    assert.deepEqual(
      bare.filter((file) => !NOT_DOMAIN[file]),
      [],
      'schema de formulário sem `.transform` e sem justificativa',
    )
    assert.deepEqual(
      Object.keys(NOT_DOMAIN).filter((file) => !bare.includes(file)),
      [],
      'justificativa apontando para schema que ganhou `.transform` — tire-o da lista',
    )
  })
})
