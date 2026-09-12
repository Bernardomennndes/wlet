import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { glob } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * Todo glob de `.claude/rules/*.md` tem de ALCANÇAR arquivo.
 *
 * O `paths:` do frontmatter é o gatilho de uma rule: é ele que decide quando ela entra em contexto.
 * Um glob que não casa com nada torna a regra INVISÍVEL — ela existe, parece que o padrão está
 * protegido, e nunca é lida. É o modo de falha silencioso do formato, e ele já aconteceu aqui: a
 * migração para monorepo extinguiu `src/**` e deixou QUINZE rules apontando para o vazio, sem
 * nenhum sinal.
 *
 * Nada mais confere isso. O Biome ignora `.claude/` neste repositório (`biome check .claude/rules`
 * responde "paths ignored"), o `tsc` não vê markdown, e o `/review-changes` lê as rules que
 * CARREGARAM — justamente as que não têm o problema.
 *
 * **A pasta é local e não versionada** (`.gitignore` tem `.claude/`), então a bateria PULA quando
 * ela não existe: um clone novo não pode falhar por causa de um diretório que ele não recebeu. Onde
 * ela existe — a máquina de quem escreve as rules —, ela vale.
 */
const pastaRules = new URL('../../../../.claude/rules/', import.meta.url)
const raizRepo = fileURLToPath(new URL('../../../../', import.meta.url))
const existe = existsSync(pastaRules)

/** Os globs do `paths:`, na ordem em que a rule os declara. */
function pathsDe(fonte: string): string[] {
  const frente = /^---\n([\s\S]*?)\n---/.exec(fonte)
  if (!frente) return []
  const bloco = /paths:\n((?:\s*-\s*.*\n)+)/.exec(frente[1])
  if (!bloco) return []
  return [...bloco[1].matchAll(/-\s*["']?([^"'\n]+)["']?\s*$/gm)].map((m) => m[1].trim())
}

/**
 * Os zeros DECLARADOS, lidos da tabela de lacunas da `naming.md` §2.
 *
 * Um glob que casa com zero arquivos não é necessariamente erro — pode ser convenção ainda não
 * exercida, e a própria `naming.md` diz isso: "a diferença importa, e confundir as duas leva a
 * 'consertar' o glob certo". O que não pode é o zero ser SILENCIOSO. Então a tabela é o registro
 * único das lacunas intencionais, e este teste exige que todo zero passe por ela.
 */
function lacunasDeclaradas(): Set<string> {
  if (!existe) return new Set()
  const fonte = readFileSync(new URL('naming.md', pastaRules), 'utf8')
  return new Set([...fonte.matchAll(/^\|\s*`([^`]+)`\s*\|\s*\*\*0\*\*\s*\|/gm)].map((m) => m[1]))
}

describe('os globs das rules alcançam arquivo', { skip: existe ? false : '.claude/rules não existe neste clone' }, () => {
  const rules = existe ? readdirSync(pastaRules).filter((n) => n.endsWith('.md')) : []
  const lacunas = lacunasDeclaradas()

  it('a pasta tem rules — o varredor não parou de olhar', () => {
    assert.ok(rules.length >= 15, `só ${rules.length} rules encontradas`)
  })

  for (const nome of rules) {
    it(`${nome}: todo glob casa com pelo menos um arquivo`, async () => {
      const fonte = readFileSync(new URL(nome, pastaRules), 'utf8')
      const padroes = pathsDe(fonte)
      assert.ok(padroes.length > 0, `${nome} não declara paths — ela nunca entra em contexto`)

      const vazios: string[] = []
      for (const padrao of padroes) {
        if (lacunas.has(padrao)) continue
        let achou = false
        // `node:fs/promises.glob` e não um script de shell: o padrão é o do frontmatter, e
        // interpretá-lo com outra ferramenta mediria uma coisa diferente da que o carregador usa.
        for await (const _ of glob(padrao, { cwd: raizRepo })) {
          achou = true
          break
        }
        if (!achou) vazios.push(padrao)
      }
      assert.deepEqual(
        vazios,
        [],
        'glob sem correspondência: a rule existe e NUNCA será lida. Conserte o padrão — ou, se o zero é intencional (convenção ainda não exercida), DECLARE-O na tabela de lacunas da naming.md §2, que é o registro único desses casos',
      )
    })
  }
})

/**
 * E a tabela de lacunas da `naming.md` §2 diz a VERDADE sobre quantos casam.
 *
 * Ela declara números medidos, e números medidos envelhecem: a linha de `*-form*` dizia **0** depois
 * de dois arquivos com esse nome já existirem, mandando o leitor procurar o padrão em `*-sheet.tsx`
 * quando ele tinha dois exemplos certos ao lado. Uma rule que erra sobre o próprio alcance é pior
 * que uma rule ausente, porque é lida com confiança.
 */
describe('a tabela de lacunas da naming.md confere com o disco', { skip: existe ? false : '.claude/rules não existe neste clone' }, () => {
  it('nenhuma lacuna declarada está, na verdade, preenchida', async () => {
    // O outro lado do mesmo erro: um zero declarado que já se fechou manda o leitor procurar o
    // padrão em outro lugar quando ele tem exemplos com o nome certo ao lado. Foi o que aconteceu
    // com `*-form*`.
    for (const padrao of lacunasDeclaradas()) {
      let contagem = 0
      for await (const _ of glob(padrao, { cwd: raizRepo })) contagem++
      assert.equal(contagem, 0, `naming.md §2 declara \`${padrao}\` como lacuna, e o disco tem ${contagem} arquivo(s)`)
    }
  })

  it('cada glob citado na tabela casa com o número que ela afirma', async () => {
    const fonte = readFileSync(new URL('naming.md', pastaRules), 'utf8')
    // As linhas da tabela são `| \`glob\` | **N** | leitura |`.
    const linhas = [...fonte.matchAll(/^\|\s*`([^`]+)`\s*\|\s*\*\*(\d+)\*\*\s*\|/gm)]
    assert.ok(linhas.length >= 2, 'a tabela de lacunas sumiu ou mudou de forma')
    for (const [, padrao, declarado] of linhas) {
      let contagem = 0
      for await (const _ of glob(padrao, { cwd: raizRepo })) contagem++
      assert.equal(contagem, Number(declarado), `naming.md §2 afirma ${declarado} para \`${padrao}\`, o disco tem ${contagem}`)
    }
  })
})
