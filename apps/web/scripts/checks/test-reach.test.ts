import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

/**
 * O SEGUNDO jeito de um teste não rodar: ele é alcançado e PULADO.
 *
 * O cabeçalho deste arquivo cobra que todo arquivo de teste caia dentro de alguma suíte. Mas um
 * arquivo alcançado ainda pode não rodar — basta um `skip` no `describe`, e a saída diz "skipped"
 * num canto enquanto o total continua verde. É a mesma aparência de cobertura, com outro caminho.
 *
 * O caso real deste repositório é legítimo: `rule-globs.test.ts` pula quando `.claude/rules` não
 * existe, porque a pasta é local e um clone novo não a tem — cobrar ali seria acusar quem não tem
 * o problema. São 63 asserções, e num clone sem as rules elas somem sem ninguém dizer.
 *
 * O que este sensor exige é que o pulo seja CONDICIONAL e MOTIVADO. Um `skip: true` fixo silencia
 * um sensor para sempre e não deixa rastro no diff de quem revisa — é a forma mais barata de
 * desligar uma garantia sem apagar o arquivo que promete tê-la.
 */
describe('nenhuma suíte é desligada em silêncio', () => {
  /**
   * Este arquivo sai da própria varredura, e o motivo é o defeito que ele acabou de ter.
   *
   * As asserções abaixo procuram `skip: true` e `.skip(` no texto dos testes — e o texto DESTE
   * arquivo contém as duas coisas, nas regex e na prosa que as explica. Escrito sem a exclusão, o
   * sensor acusou a si mesmo nas duas afirmações.
   *
   * É a mesma armadilha que o `browser-storage.test.ts` resolve removendo comentários antes de
   * buscar: um sensor que descreve o que procura vira seu próprio infrator. Aqui a saída é mais
   * simples — quem vigia não se vigia —, e a troca é declarada: um `skip` fixo NESTE arquivo passa
   * despercebido, e é por isso que ele é o único da lista que nenhuma outra linha protege.
   */
  const SELF = 'apps/web/scripts/checks/test-reach.test.ts'

  const checkFiles = () =>
    readdirSync(`${repoRoot}apps/web/scripts/checks`)
      .filter((name) => name.endsWith('.test.ts'))
      .map((name) => `apps/web/scripts/checks/${name}`)
      .concat(
        readdirSync(`${repoRoot}apps/api/tests`)
          .filter((n) => n.endsWith('.test.ts'))
          .map((n) => `apps/api/tests/${n}`),
      )
      .filter((file) => file !== SELF)

  it('todo `skip` é condicional, e nenhum é fixo', () => {
    // `skip: true` e `it.skip(` desligam sem condição. Um sensor assim continua na lista de
    // arquivos, continua sendo contado como teste, e não afirma mais nada.
    const fixed: string[] = []
    for (const file of checkFiles()) {
      const source = read(file)
      if (/skip:\s*true/.test(source) || /\b(it|describe|test)\.skip\s*\(/.test(source)) fixed.push(file)
    }
    assert.deepEqual(fixed, [], 'pulo incondicional: apague o arquivo ou conserte o teste, mas não o silencie')
  })

  it('e todo `skip` condicional diz por que pularia', () => {
    // A condição sozinha não basta: quem lê a saída precisa saber o que faltou. Os dois arquivos
    // que pulam hoje respondem "as rules são locais e não vieram neste clone" — é isso que
    // transforma um "skipped" mudo em informação.
    //
    // **O sensor lê o NOME que o `skip:` usa e vai conferir a declaração dele.** As duas primeiras
    // versões deste teste procuravam uma grafia fixa e reprovaram arquivos corretos: um usa
    // `skipReason = existsSync(...) ? false : '…'` e o outro `reason = available ? undefined : '…'`
    // — nomes, condições e valores de "não pule" todos diferentes. Um padrão preso à grafia de um
    // arquivo não é regra; é coincidência.
    const mute: string[] = []
    for (const file of checkFiles()) {
      const source = read(file)
      for (const match of source.matchAll(/skip:\s*([A-Za-z_$][\w$]*)/g)) {
        const declared = new RegExp(`(?:const|let)\\s+${match[1]}\\s*=[^\\n]*'[^']{10,}'`).test(source)
        if (!declared) mute.push(`${file}: \`${match[1]}\` não carrega a frase que explica o pulo`)
      }
    }
    assert.deepEqual(mute, [])
  })

  it('e, NESTE clone, nada está sendo pulado', () => {
    // A condição do `rule-globs` é a existência de `.claude/rules`, que aqui existe. Se um dia
    // deixar de existir na máquina de quem roda o portão, é melhor descobrir por esta linha do que
    // por um sensor calado.
    assert.ok(existsSync(`${repoRoot}.claude/rules`), 'as rules sumiram — `rule-globs.test.ts` está pulando 63 asserções agora')
  })
})
