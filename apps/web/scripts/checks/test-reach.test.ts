import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { repoRoot } from './support/source-fields'

/**
 * Um teste que nunca RODA é pior que teste nenhum: ele parece cobertura.
 *
 * As duas suítes deste repositório alcançam três lugares — `apps/api/tests/*.test.ts`,
 * `apps/web/scripts/checks/*.test.ts` e `apps/web/src/**` — e a lista é FRÁGIL de um jeito que não
 * dá sinal. Os dois primeiros globs são RASOS: um arquivo em `scripts/checks/support/` não é
 * alcançado. E **nenhum pacote tem script de teste**: um `packages/domain/src/purchases.test.ts`
 * seria escrito, commitado, apareceria na busca de quem procurasse cobertura, e não rodaria nunca.
 *
 * O caso não é hipotético — `@wlet/domain/purchases` acabou de nascer, e o lugar óbvio para testá-lo
 * é ao lado dele.
 *
 * O sensor não opina sobre ONDE o teste deve morar; ele cobra que o lugar escolhido seja alcançado
 * por alguma suíte. Se a resposta for "quero testes dentro de `packages/`", o conserto é dar script
 * ao pacote e acrescentar o alcance aqui — e é essa conversa que o vermelho provoca.
 */
const WEB = 'apps/web/package.json'
const API = 'apps/api/package.json'

const read = (relative: string) => readFileSync(`${repoRoot}${relative}`, 'utf8')

function testFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (entry.name.endsWith('.test.ts')) out.push(relative)
    }
  }
  walk('apps/', 'apps/')
  walk('packages/', 'packages/')
  return out.sort()
}

/** Os três alcances, escritos como as suítes os declaram — dois RASOS e um recursivo. */
const REACHED = [
  (file: string) => /^apps\/api\/tests\/[^/]+\.test\.ts$/.test(file),
  (file: string) => /^apps\/web\/scripts\/checks\/[^/]+\.test\.ts$/.test(file),
  (file: string) => /^apps\/web\/src\/.+\.test\.ts$/.test(file),
]

describe('todo teste escrito é um teste que roda', () => {
  it('há teste sendo encontrado', () => {
    assert.ok(testFiles().length >= 75, `só ${testFiles().length} arquivos de teste encontrados`)
  })

  it('nenhum arquivo de teste fica fora do alcance das suítes', () => {
    const orphans = testFiles().filter((file) => !REACHED.some((reaches) => reaches(file)))
    assert.deepEqual(orphans, [], 'teste que nenhuma suíte executa — ele parece cobertura e não é')
  })

  it('e o alcance que este teste descreve é o que os scripts realmente rodam', () => {
    // Sem isto, o sensor passa a descrever um passado: alguém estreita o glob do `package.json`,
    // os arquivos continuam onde estão, e o teste continua verde afirmando que são alcançados.
    const web = JSON.parse(read(WEB)) as { scripts: Record<string, string> }
    const api = JSON.parse(read(API)) as { scripts: Record<string, string> }
    assert.match(web.scripts.check, /scripts\/checks\/\*\.test\.ts/)
    assert.match(web.scripts.check, /src\/\*\*\/\*\.test\.ts/)
    assert.match(api.scripts.check, /tests\/\*\.test\.ts/)
  })

  it('e um pacote com teste precisa de script para rodá-lo', () => {
    // Hoje nenhum `packages/*` tem script de teste, e é por isso que o teste acima trata
    // `packages/` como fora de alcance. Se um pacote ganhar `test` ou `check`, esta lista muda —
    // e o vermelho é o aviso de que o alcance acima também precisa mudar.
    const withScript: string[] = []
    for (const pkg of readdirSync(`${repoRoot}packages`, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      let manifest: { scripts?: Record<string, string> }
      try {
        manifest = JSON.parse(read(`packages/${pkg.name}/package.json`))
      } catch {
        continue
      }
      if (manifest.scripts?.test || manifest.scripts?.check) withScript.push(pkg.name)
    }
    assert.deepEqual(withScript, [], 'um pacote ganhou script de teste — acrescente o alcance dele em REACHED')
  })
})
