import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { repoRoot } from './support/source-fields'

/**
 * As rules apontam umas para as outras por NÚMERO de seção, e nada conferia isso.
 *
 * Um ponteiro quebrado não é ruído: ele manda o leitor ao texto errado com a confiança de quem
 * seguiu uma referência. E é o tipo de coisa que quebra sozinha — renumerar uma seção conserta o
 * arquivo e estraga quem apontava para ele, sem nenhum sinal. O `tsc` não lê markdown, o Biome
 * ignora `.claude/`, e a `rule-globs.test.ts` só confere os CAMINHOS citados, não as seções.
 *
 * ACHOU três de verdade na primeira execução: `form-output-contract.md` apontava para `§4.4`,
 * `§4.8` e `§5.5` de `forms.md` — subseções do projeto de ORIGEM, que a versão enxuta daqui não
 * tem. Foram repontadas para o que existe, ou trocadas pelo nome do assunto.
 *
 * **O que este sensor NÃO confere está declarado, e é a maior parte.** Referência em prosa —
 * "§4.4 e §5.5 de `forms.md`", "§12.4 daquela regra" — não se atribui por padrão sem errar: duas
 * tentativas minhas produziram falso positivo em direções opostas, ora culpando o arquivo que
 * cita, ora o citado. Um sensor que acusa texto correto é desligado na primeira vez. Ficam as
 * formas INEQUÍVOCAS, e a contagem do que sobrou de fora aparece no teste — coberta parcial
 * declarada vale mais que cobertura total que mente.
 */
const RULES = '.claude/rules'

/** As rules são locais (o `.claude/` é ignorado pelo git), então um clone limpo não as tem. */
const available = existsSync(`${repoRoot}${RULES}`)
const reason = available ? undefined : 'as rules são locais e não vieram neste clone'

const ruleFiles = () => (available ? readdirSync(`${repoRoot}${RULES}`).filter((f) => f.endsWith('.md')) : [])
const readRule = (name: string) => readFileSync(`${repoRoot}${RULES}/${name}`, 'utf8')

/** Os números de seção que um arquivo declara — `## 4.` conta como `4`, e `### 4.2` como ambos. */
function sectionNumbers(source: string): Set<string> {
  const out = new Set<string>()
  for (const m of source.matchAll(/^#{2,4}\s+(\d+(?:\.\d+)?)/gm)) {
    out.add(m[1])
    out.add(m[1].split('.')[0])
  }
  return out
}

/** `` `x.md` §N `` e `§N de \`x.md\`` — as duas formas em que o alvo é indiscutível. */
function references(source: string): { target: string; section: string; line: number }[] {
  const FILE = '`([a-z][a-z0-9-]*\\.md)`'
  const out: { target: string; section: string; line: number }[] = []
  for (const m of source.matchAll(new RegExp(`${FILE}\\s*§\\s?(\\d+(?:\\.\\d+)?)`, 'g'))) {
    out.push({ target: m[1], section: m[2], line: source.slice(0, m.index).split('\n').length })
  }
  for (const m of source.matchAll(new RegExp(`§\\s?(\\d+(?:\\.\\d+)?)\\s+(?:de|da|do|em|na)\\s+${FILE}`, 'g'))) {
    out.push({ target: m[2], section: m[1], line: source.slice(0, m.index).split('\n').length })
  }
  return out
}

describe('as referências entre rules apontam para seções que existem', { skip: reason }, () => {
  const byFile = new Map(ruleFiles().map((name) => [name, sectionNumbers(readRule(name))]))

  it('há rule sendo lida, e elas têm seções numeradas', () => {
    assert.ok(ruleFiles().length >= 15, `só ${ruleFiles().length} rules encontradas`)
    const numbered = [...byFile.values()].filter((s) => s.size > 0).length
    assert.ok(numbered >= 15, `só ${numbered} rules com seção numerada — o leitor de heading quebrou`)
  })

  it('nenhuma referência inequívoca aponta para o vazio', () => {
    const broken: string[] = []
    let checked = 0
    for (const name of ruleFiles()) {
      for (const { target, section, line } of references(readRule(name))) {
        checked++
        const targetSections = byFile.get(target)
        if (!targetSections) broken.push(`${name}:${line} → ${target} (arquivo que não existe)`)
        else if (!targetSections.has(section)) broken.push(`${name}:${line} → ${target} §${section} (a rule tem ${[...targetSections].sort().join(', ')})`)
      }
    }
    // Piso ABSOLUTO, e não proporção. A primeira versão comparava conferidas com o total de `§`
    // do conjunto, e essa medida não sabe cair: trocar referências por prosa derruba os dois
    // lados juntos e a razão não se mexe — testei, e nenhum teste ficou vermelho. Hoje são 51; o
    // piso em 45 dispara se um punhado delas virar prosa, que é a única deriva que importa aqui.
    assert.ok(checked >= 45, `só ${checked} referências inequívocas lidas — ou o padrão quebrou, ou elas viraram prosa`)
    assert.deepEqual(broken, [], 'referência entre rules apontando para seção inexistente')
  })
})
