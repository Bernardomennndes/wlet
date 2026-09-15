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
const SECTION = '## Débitos em aberto'

const doc = () => read(CLAUDE)
const section = () => {
  const at = doc().indexOf(SECTION)
  assert.notEqual(at, -1, 'a seção de débitos sumiu do CLAUDE.md')
  return doc().slice(at)
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

  it('`docs/` na raiz continua fora do `.gitignore`', () => {
    // Só vale enquanto a pasta existir: num clone sem ela o débito não se manifesta, e cobrar
    // seria acusar quem não tem o problema.
    if (!existsSync(`${repoRoot}docs`)) return
    let ignored = true
    try {
      execFileSync('git', ['check-ignore', '-q', 'docs'], { cwd: repoRoot })
    } catch {
      ignored = false
    }
    assert.equal(ignored, false, '`docs/` passou a ser ignorado — tire o item da seção "Débitos em aberto"')
  })
})
