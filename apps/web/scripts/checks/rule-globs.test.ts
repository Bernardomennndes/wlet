import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { glob } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Todo glob de `.claude/rules/*.md` tem de ALCANÇAR arquivo.
 *
 * O `paths:` do frontmatter é o gatilho de uma rule: é ele que decide quando ela entra em contexto.
 * Um glob que não casa com nada torna a regra INVISÍVEL — ela está lá, parece que o padrão está
 * protegido, e nunca é lida. É o modo de falha silencioso do formato, e ele já aconteceu aqui: a
 * migração para monorepo extinguiu `src/**` e deixou QUINZE rules apontando para o vazio, sem
 * nenhum sinal.
 *
 * Nada mais confere isso. O Biome ignora `.claude/` neste repositório (`biome check .claude/rules`
 * responde "paths ignored"), o `tsc` não vê markdown, e o `/review-changes` lê as rules que
 * CARREGARAM — justamente as que não têm o problema.
 *
 * **A pasta é local e não versionada** (`.gitignore` tem `.claude/`), então a bateria PULA quando
 * ela falta: um clone novo não pode falhar por causa de um diretório que não recebeu. Onde ela
 * existe — a máquina de quem escreve as rules —, ela vale.
 */
const rulesDir = new URL('../../../../.claude/rules/', import.meta.url)
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const rulesExist = existsSync(rulesDir)
const skipReason = rulesExist ? false : '.claude/rules não existe neste clone'

/** Os globs do `paths:`, na ordem em que a rule os declara. */
function pathsOf(source: string): string[] {
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(source)
  if (!frontMatter) return []
  const block = /paths:\n((?:\s*-\s*.*\n)+)/.exec(frontMatter[1])
  if (!block) return []
  return [...block[1].matchAll(/-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1].trim())
}

/** Quantos arquivos um glob do frontmatter alcança, contados a partir da raiz do repositório. */
async function matchCount(pattern: string): Promise<number> {
  let total = 0
  // `node:fs/promises.glob` e não um script de shell: o padrão é o do frontmatter, e interpretá-lo
  // com outra ferramenta mediria uma coisa diferente da que o carregador de rules usa.
  for await (const _ of glob(pattern, { cwd: repoRoot })) total++
  return total
}

/**
 * Os zeros DECLARADOS, lidos da tabela de lacunas da `naming.md` §2.
 *
 * Um glob que casa com zero arquivos não é necessariamente erro — pode ser convenção ainda não
 * exercida, e a própria `naming.md` diz que "confundir as duas leva a consertar o glob certo". O que
 * não pode é o zero ser SILENCIOSO. A tabela é o registro único das lacunas intencionais, e este
 * arquivo exige que todo zero passe por ela.
 */
function declaredGaps(): Set<string> {
  if (!rulesExist) return new Set()
  const source = readFileSync(new URL('naming.md', rulesDir), 'utf8')
  return new Set([...source.matchAll(/^\|\s*`([^`]+)`\s*\|\s*\*\*0\*\*\s*\|/gm)].map((m) => m[1]))
}

/** As linhas `| glob | **N** | leitura |` da mesma tabela, com o número que ela afirma. */
function declaredCounts(): [string, number][] {
  if (!rulesExist) return []
  const source = readFileSync(new URL('naming.md', rulesDir), 'utf8')
  return [...source.matchAll(/^\|\s*`([^`]+)`\s*\|\s*\*\*(\d+)\*\*\s*\|/gm)].map((m) => [m[1], Number(m[2])])
}

describe('os globs das rules alcançam arquivo', { skip: skipReason }, () => {
  const ruleFiles = rulesExist ? readdirSync(rulesDir).filter((n) => n.endsWith('.md')) : []
  const gaps = declaredGaps()

  it('a pasta tem rules — o varredor não parou de olhar', () => {
    assert.ok(ruleFiles.length >= 15, `só ${ruleFiles.length} rules encontradas`)
  })

  for (const name of ruleFiles) {
    it(`${name}: todo glob casa com pelo menos um arquivo`, async () => {
      const patterns = pathsOf(readFileSync(new URL(name, rulesDir), 'utf8'))
      assert.ok(patterns.length > 0, `${name} não declara paths — ela nunca entra em contexto`)

      const unmatched: string[] = []
      for (const pattern of patterns) {
        if (gaps.has(pattern)) continue
        if ((await matchCount(pattern)) === 0) unmatched.push(pattern)
      }
      assert.deepEqual(
        unmatched,
        [],
        'glob sem correspondência: a rule está lá e NUNCA será lida. Conserte o padrão — ou, se o zero é intencional (convenção ainda não exercida), DECLARE-O na tabela de lacunas da naming.md §2, que é o registro único desses casos',
      )
    })
  }
})

/**
 * E a tabela de lacunas da `naming.md` §2 diz a VERDADE sobre quantos casam.
 *
 * Ela declara números medidos, e números medidos envelhecem: a linha de `*-form*` afirmava zero
 * depois de dois arquivos com esse nome já existirem, mandando o leitor procurar o padrão em
 * `*-sheet.tsx` quando ele tinha dois exemplos certos ao lado. Uma rule que erra sobre o próprio
 * alcance é pior que uma rule ausente, porque é lida com confiança.
 */
describe('a tabela de lacunas da naming.md confere com o disco', { skip: skipReason }, () => {
  it('nenhuma lacuna declarada está, na verdade, preenchida', async () => {
    for (const pattern of declaredGaps()) {
      assert.equal(await matchCount(pattern), 0, `naming.md §2 declara \`${pattern}\` como lacuna, e o disco tem arquivo`)
    }
  })

  it('cada glob citado na tabela casa com o número que ela afirma', async () => {
    const rows = declaredCounts()
    assert.ok(rows.length >= 2, 'a tabela de lacunas sumiu ou mudou de forma')
    for (const [pattern, declared] of rows) {
      assert.equal(await matchCount(pattern), declared, `naming.md §2 afirma ${declared} para \`${pattern}\``)
    }
  })
})

/**
 * E as REFERÊNCIAS VIVAS das rules apontam para arquivos que existem.
 *
 * Uma rule cita arquivos como exemplo do padrão certo ("veja `packages/services/…`"). Quando um
 * desses caminhos morre, quem abre a rule não acha o exemplo e para de confiar no resto dela — e
 * nada avisa: markdown não compila. Aconteceu agora mesmo, e por uma razão boba: três arquivos de
 * teste foram renomeados e quatro citações em três rules ficaram apontando para o nome antigo.
 *
 * **A checagem é estreita de propósito.** Só caminhos que começam com `apps/`, `packages/` ou
 * `config/` são conferidos — esses são inequivocamente deste repositório. As rules também citam
 * caminhos relativos em prosa (`shared/shape.ts`), documentos da skill `/ui` (`components/dialog.md`)
 * e, deliberadamente, arquivos do projeto de onde vieram, como linhagem; exigir que TODOS existam
 * transformaria o sensor em ruído, e ruído é o que faz um sensor ser desligado.
 */
const FORA_DO_REPO = /^apps\/backoffice\//

describe('as referências vivas das rules existem', { skip: skipReason }, () => {
  for (const name of rulesExist ? readdirSync(rulesDir).filter((n) => n.endsWith('.md')) : []) {
    it(`${name}: todo caminho de apps/ packages/ config/ resolve`, () => {
      const source = readFileSync(new URL(name, rulesDir), 'utf8')
      const refs = new Set([...source.matchAll(/`((?:apps|packages|config)\/[A-Za-z0-9_@/.-]*\.(?:ts|tsx|css|json|md|sql))`/g)].map((m) => m[1]))
      const dead = [...refs].filter((ref) => !FORA_DO_REPO.test(ref) && !existsSync(new URL(ref, new URL('file://' + repoRoot))))
      assert.deepEqual(dead, [], 'referência viva quebrada: quem abre a rule não acha o exemplo e para de confiar nela')
    })
  }
})

/**
 * E nenhuma rule escreve um caminho deste repositório começando por `src/`.
 *
 * O sensor acima é estreito de propósito e só confere `apps/`, `packages/` e `config/`. O buraco
 * que sobrava era o prefixo `src/`: ele PARECE deste projeto, e às vezes é — `src/lib/chart-tokens.ts`
 * existe, sob `apps/web/` —, mas às vezes é da Selfie, que também tinha um `src/`. Quem lê não tem
 * como saber qual, e o sensor não conferia nenhum dos dois.
 *
 * Medido quando esta checagem foi escrita: 19 caminhos `src/…` nas rules, 16 existindo sob
 * `apps/web/` e 3 não. Onze referências vivas apontavam para o vazio sem nada avisar, entre elas a
 * §8 de `services-architecture.md` mandando importar tipo de domínio de `@/data/types` — pasta que
 * não existe neste repositório desde a migração para monorepo.
 *
 * A saída é tirar a ambiguidade em vez de adivinhar: caminho deste projeto começa com `apps/` ou
 * `packages/` e cai no sensor acima; caminho da Selfie fica como linhagem e DIZ que é. `src/` puro
 * não é nem um nem outro.
 */
describe('as rules não escrevem caminho ambíguo', { skip: skipReason }, () => {
  for (const name of rulesExist ? readdirSync(rulesDir).filter((n) => n.endsWith('.md')) : []) {
    it(`${name}: nenhum caminho começa por \`src/\` sem dizer que é da origem`, () => {
      const lines = readFileSync(new URL(name, rulesDir), 'utf8').split('\n')
      const ambiguous: string[] = []
      for (const [i, line] of lines.entries()) {
        for (const found of line.matchAll(/`(src\/[A-Za-z0-9_@/.()[\]-]*\.(?:ts|tsx|css|json|sql))`/g)) {
          // A marca de linhagem pode estar na linha anterior ou na seguinte: a prosa quebra em 100
          // colunas, e exigir que ela caia na MESMA linha do caminho acusaria texto correto.
          const around = lines.slice(Math.max(0, i - 1), i + 2).join(' ')
          if (/ORIGEM|não existe|não existem/.test(around)) continue
          ambiguous.push(`${name}:${i + 1} ${found[1]}`)
        }
      }
      assert.deepEqual(ambiguous, [], 'caminho deste projeto começa com `apps/` ou `packages/` — `src/` puro parece daqui e pode ser da Selfie, e nenhum sensor confere')
    })
  }
})
