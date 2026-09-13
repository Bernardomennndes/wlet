import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * O `handleSubmit` não monta o payload — quem monta é o schema.
 *
 * A §2.1 de `form-output-contract.md` proíbe adaptador entre o formulário e quem consome, e o custo
 * dele não é a indireção: é que o tipo inferido do schema deixa de ser o payload, e aí a conversão
 * que o adaptador faz fica fora do alcance do teste de `parse` — provar aquela regra passa a exigir
 * montar React, e na prática ninguém prova.
 *
 * **Medido aqui**, no formulário de rubricas: o adaptador convertia `unit: '' → undefined`, que é
 * regra de domínio (campo opcional não se grava como string vazia). O teste do schema afirmava que
 * `unit: ''` PASSA na validação — outra pergunta. Removida a conversão, nenhum teste caía. Movida
 * para um `.transform()` no schema, cai.
 *
 * A forma correta está em três schemas: `useForm<Entrada, unknown, Saída>` mais `.transform()`, de
 * modo que `z.output` É o payload e o `handleSubmit` recebe o objeto pronto.
 *
 * A assinatura procurada é estreita: declarar uma variável com TIPO em maiúscula e montá-la a
 * partir dos valores submetidos. Não acusa cálculo no handler (uma guarda de igualdade, um
 * `return` antecipado) — só a construção do objeto que vai sair.
 */
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

function tsxFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsxFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`))
    else if (entry.name.endsWith('.tsx')) out.push(`${prefix}${entry.name}`)
  }
  return out
}

/** O corpo de cada `handleSubmit((x) => { … })`, fechando a chave no mesmo nível. */
function submitBodies(source: string): { line: number; body: string }[] {
  const out: { line: number; body: string }[] = []
  for (const found of source.matchAll(/handleSubmit\(\([^)]*\)\s*=>\s*\{/g)) {
    let i = found.index + found[0].length - 1
    let depth = 0
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) break
    }
    out.push({ line: source.slice(0, found.index).split('\n').length, body: source.slice(found.index + found[0].length, i) })
  }
  return out
}

describe('o payload do formulário sai do schema', () => {
  const files = tsxFiles(webSrc)

  it('há formulário sendo lido — o varredor não parou de olhar', () => {
    const withForms = files.filter((relative) => readFileSync(`${webSrc}${relative}`, 'utf8').includes('handleSubmit('))
    assert.ok(withForms.length >= 2, `só ${withForms.length} arquivos com handleSubmit`)
  })

  it('nenhum handleSubmit monta um objeto tipado', () => {
    const adapters: string[] = []
    for (const relative of files) {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
      for (const { line, body } of submitBodies(source)) {
        const literal = /const \w+:\s*[A-Z]\w+\s*=\s*\{/.exec(body)
        if (literal) adapters.push(`${relative}:${line} ${literal[0]}`)
      }
    }
    assert.deepEqual(
      adapters,
      [],
      'adaptador no handleSubmit (§2.1): mova a conversão para um `.transform()` no schema e tipe o `useForm<Entrada, unknown, Saída>` — senão a regra que o adaptador aplica não é alcançável por teste de `parse`',
    )
  })
})
