import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * A tabela de superfície sem chamador da `api-contracts.md` §2.3 diz a VERDADE.
 *
 * Ela declara números MEDIDOS — "das 22 rotas do contrato, sete não têm chamador" — e lista quais,
 * com o motivo de cada uma. Números medidos envelhecem: ligar `plans.add` a um adapter não faz a
 * linha dela sair da tabela, e nada avisa. O precedente é o da `naming.md` §2, cujos números
 * `rule-globs.test.ts` já confere pela mesma razão: uma rule que erra sobre o próprio alcance é
 * lida com confiança e manda o leitor para a conclusão errada.
 *
 * Aqui o erro custaria mais que uma referência quebrada. A tabela é o que sustenta uma decisão de
 * arquitetura em aberto: as cinco rotas granulares de plano existem porque a porta agregada tem uma
 * janela de perda medida, e **enquanto a decisão não for tomada, nem as rotas saem nem o `disabled`
 * da tela sai**. Se a tabela deixar de bater com o disco, essa amarração se desfaz sem ninguém ver.
 *
 * As rules são locais e não versionadas (`.gitignore` tem `.claude/`), então a bateria PULA quando a
 * pasta falta — um clone novo não pode falhar por um diretório que não recebeu.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const rulesDir = new URL('../../../../.claude/rules/', import.meta.url)
const skipReason = existsSync(rulesDir) ? false : '.claude/rules não existe neste clone'

/** Toda rota do contrato, como `grupo.nome`, com o método e o path que ela declara. */
function contractRoutes(): { id: string; method: string; path: string }[] {
  const domains = `${repoRoot}packages/api/src/domains/`
  const routes: { id: string; method: string; path: string }[] = []
  for (const group of readdirSync(domains)) {
    const file = `${domains}${group}/routes.ts`
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    for (const found of source.matchAll(/^\s{2}(\w+):\s*oc[\s\S]{0,120}?\.route\(\{\s*method:\s*'(\w+)',\s*path:\s*'([^']+)'/gm)) {
      routes.push({ id: `${group}.${found[1]}`, method: found[2], path: found[3] })
    }
  }
  return routes
}

/** Os arquivos onde um chamador pode estar: os adapters e as telas. */
function callSites(): string {
  const roots = [`${repoRoot}packages/services/src`, `${repoRoot}apps/web/src`]
  const parts: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) parts.push(readFileSync(full, 'utf8'))
    }
  }
  for (const root of roots) walk(root)
  return parts.join('\n')
}

/**
 * As rotas que a §2.3 declara sem chamador, lidas da tabela por `MÉTODO /path`.
 *
 * Só a PRIMEIRA CÉLULA de cada linha da tabela entra — é ela que lista a rota. A coluna do motivo
 * cita `PUT /plans` e `PUT /dataset/sources` justamente para explicar por que as outras não são
 * chamadas, e ler a linha inteira colhia essas duas como declaradas sem chamador. Elas têm chamador:
 * o sensor acusava a si mesmo, duas vezes seguidas, primeiro pela prosa e depois pela coluna.
 */
function declaredWithoutCaller(): Set<string> {
  const source = readFileSync(new URL('api-contracts.md', rulesDir), 'utf8')
  const section = source.slice(source.indexOf('## 2.3'))
  const declared = new Set<string>()
  for (const line of section.slice(0, section.indexOf('\n## ', 3)).split('\n')) {
    if (!line.startsWith('|')) continue
    const cell = line.split('|')[1]
    if (!cell) continue
    for (const found of cell.matchAll(/`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^`]*)`/g)) declared.add(`${found[1]} ${found[2]}`)
  }
  return declared
}

describe('a superfície sem chamador da api-contracts.md §2.3', { skip: skipReason }, () => {
  it('o total de rotas do contrato é o que a §2.3 afirma', () => {
    const source = readFileSync(new URL('api-contracts.md', rulesDir), 'utf8')
    const afirmado = /Das (\d+) rotas do contrato, \*\*(\w+) não têm chamador\*\*/.exec(source)
    assert.ok(afirmado, 'a frase medida da §2.3 mudou de forma — o sensor não sabe mais o que conferir')
    assert.equal(contractRoutes().length, Number(afirmado[1]), `a §2.3 afirma ${afirmado[1]} rotas`)
  })

  it('e são exatamente essas que ninguém chama', () => {
    const fontes = callSites()
    const semChamador = contractRoutes()
      // `client.grupo.rota(` é o adapter; `api().grupo.rota` é a leitura da tela. Procurar pelo
      // NOME sozinho acusaria qualquer método de serviço com o mesmo nome — foi o que uma medição
      // anterior fez, dizendo que `plans.addGroup` tinha chamador quando o que casou foi o método
      // homônimo do serviço.
      .filter(({ id }) => !fontes.includes(`client.${id}(`) && !fontes.includes(`api().${id}`))
      .map(({ id, method, path }) => ({ id, chave: `${method} ${path}` }))

    const declaradas = declaredWithoutCaller()
    const naoDeclaradas = semChamador.filter((r) => !declaradas.has(r.chave)).map((r) => `${r.id} (${r.chave})`)
    const jaLigadas = [...declaradas].filter((chave) => !semChamador.some((r) => r.chave === chave))

    assert.deepEqual(naoDeclaradas, [], 'rota declarada sem chamador e FORA da tabela da §2.3: ou ligue um chamador, ou registre a rota na tabela com o motivo')
    assert.deepEqual(
      jaLigadas,
      [],
      'a tabela da §2.3 lista como "sem chamador" uma rota que JÁ tem um: tire a linha — e, se era uma das cinco de plano, a decisão da porta agregada foi tomada e o `disabled` da tela precisa ser revisto junto',
    )
  })
})
