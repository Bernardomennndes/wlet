import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot } from './support/source-fields'

/**
 * O balanço de débitos não pode sobreviver aos problemas que descreve.
 *
 * A seção "Débitos em aberto" do `CLAUDE.md` existe porque um problema conhecido e não consertado
 * vale mais escrito que esquecido — mas um item que já foi resolvido e continua lá é pior que
 * nenhum: ele manda a próxima pessoa procurar um defeito que não existe, e ensina a desconfiar do
 * resto da lista.
 *
 * Este sensor confere o que é MECANICAMENTE conferível: que os guardas citados existem, e que os
 * dois débitos com forma verificável ainda são verdade. Quando um deles for consertado, o teste
 * fica vermelho pedindo para TIRAR o item — não para consertar de novo.
 */
const CLAUDE = 'CLAUDE.md'

/**
 * A âncora é o CABEÇALHO, no início de uma linha — e isso custou um portão vermelho.
 *
 * Era `indexOf('## Débitos em aberto')`, e bastou eu escrever esse título DENTRO de uma nota, entre
 * crases, para o `indexOf` encontrar a menção antes do cabeçalho e fatiar o arquivo a partir dali.
 * A seção passou a ter 115 "débitos" — todas as notas do documento —, contra 8 guardas, e o sensor
 * ficou vermelho acusando o próprio texto que o explicava.
 *
 * Uma âncora que qualquer prosa pode mover não é âncora. `^## ` presa ao começo da linha, e o fim
 * no próximo cabeçalho de mesmo nível, tornam o recorte independente do que se escreve sobre ele.
 */
const section = () => {
  const source = read(CLAUDE)
  const start = source.search(/^## Débitos em aberto\s*$/m)
  assert.notEqual(start, -1, 'a seção de débitos sumiu do CLAUDE.md')
  const rest = source.slice(start + 1)
  const end = rest.search(/^## /m)
  return end === -1 ? source.slice(start) : source.slice(start, start + 1 + end)
}

describe('o balanço de débitos está inteiro', () => {
  it('há itens, e cada um nomeia o guarda', () => {
    const items = [...section().matchAll(/^- \*\*/gm)]
    const guards = [...section().matchAll(/\*Guarda:\*/g)]
    assert.ok(items.length >= 5, `só ${items.length} débitos listados`)
    assert.equal(guards.length, items.length, 'todo débito precisa dizer onde está o guarda — ou que não há')
  })

  it('todo arquivo de teste citado como guarda existe', () => {
    // Guarda citado e inexistente é a mesma mentira de uma referência quebrada entre rules: quem
    // for conferir não acha, e para de confiar na lista.
    const missing: string[] = []
    for (const match of section().matchAll(/`([a-z-]+\.test\.ts)`/g)) {
      if (!existsSync(`${repoRoot}apps/web/scripts/checks/${match[1]}`)) missing.push(match[1])
    }
    assert.deepEqual(missing, [])
  })
})

describe('e nenhum débito já foi pago sem sair da lista', () => {
  it('`plans.ts` ainda documenta a era do navegador', () => {
    const source = read('packages/domain/src/plans.ts')
    const stale = source.includes('guardado no navegador') || source.includes('@/lib/storage')
    const consumers = execFileSync('git', ['grep', '-l', 'PLANS_KEY', '--', 'apps', 'packages'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !f.endsWith('packages/domain/src/plans.ts'))
    assert.ok(stale || consumers.length > 0, 'o `plans.ts` foi limpo — tire o item da seção "Débitos em aberto"')
  })

  /**
   * Esta afirmação guardava o enquadramento ANTIGO do débito, e por isso foi reescrita.
   *
   * Ela exigia que `docs/` na raiz NÃO estivesse no `.gitignore`, e mandava tirar o item se
   * passasse a estar. O item mudou: medido em 15/09/2026, os extratos moram em `apps/web/docs/`,
   * que ESTÁ ignorada, e a raiz `docs/` guarda só specs — que devem mesmo ser versionadas. A
   * mensagem antiga daria conselho errado a quem a lesse.
   *
   * O que o débito hoje descreve é valor REAL de compra em arquivo versionado, e o que o protege é
   * a pasta dos extratos continuar ignorada. É isso que se afirma agora.
   */
  it('a pasta dos EXTRATOS continua ignorada — é ela que protege', () => {
    // Perder esta linha do `.gitignore` é o único caminho para extrato, fatura e relatório da
    // corretora entrarem num commit. O débito dos valores em prosa é pequeno ao lado disso.
    let ignored = false
    try {
      execFileSync('git', ['check-ignore', '-q', 'apps/web/docs'], { cwd: repoRoot })
      ignored = true
    } catch {
      ignored = false
    }
    assert.equal(ignored, true, '`apps/web/docs/` saiu do `.gitignore` — os extratos ficaram commitáveis')
  })

  it('e os valores que o débito nomeia ainda estão em arquivo versionado', () => {
    // O outro lado: se os números saírem dos arquivos, o débito foi pago e o item tem de sair da
    // lista. Conferido pelo `git grep`, que só enxerga o que está RASTREADO — é a pergunta certa,
    // porque o risco é o repositório virar público, não o disco de quem trabalha nele.
    const tracked = execFileSync('git', ['grep', '-l', '-E', '5\\.?622[,.]2|937[,.]03', '--', 'docs', 'apps', 'packages'], { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean)
    assert.ok(tracked.length > 0, 'os valores sumiram dos arquivos versionados — tire o item da seção "Débitos em aberto"')
  })
})
