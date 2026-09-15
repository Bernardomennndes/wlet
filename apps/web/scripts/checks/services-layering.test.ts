import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * A CAMADA DE SERVIÇOS — a maior rule do repositório, e a única sem sensor de conteúdo.
 *
 * `services-architecture.md` tem dez seções e governa `packages/services/src/**`, que é onde a
 * migração mora: são os cinco contextos que trocaram armazenamento de navegador por oRPC sem os
 * casos de uso mudarem uma linha. Até aqui, o que a checava era o `rule-globs.test.ts` — que só
 * confere se o `paths` do cabeçalho casa com arquivo de verdade. O CONTEÚDO dependia de alguém
 * lembrar.
 *
 * Medi a camada inteira antes de escrever: ela cumpre todos os invariantes daqui hoje. O sensor
 * não conserta nada — ele impede a deriva, que é a forma como esta rule some. Nenhuma das
 * violações abaixo estoura teste, quebra build ou aparece na tela; cada uma desfaz em silêncio a
 * separação que permitiu a troca dos cinco armazenamentos.
 *
 * O que NÃO está aqui, de propósito: a §6 exige adapter como factory e não classe, mas o
 * `tsconfig` liga `erasableSyntaxOnly` e o `tsc` recusa parameter property antes de qualquer
 * teste. Sensor que repete o compilador é ruído — o que vale encodar é o que ele não vê.
 */
const SERVICES = 'packages/services/src/'

/**
 * O que é CONTEXTO e o que é base comum — a distinção que a §4 pressupõe sem nomear.
 *
 * Contexto delimitado é a pasta que tem barrel: `config`, `dataset`, `overrides`, `plans`,
 * `preferences`. `shared/` não tem `index.ts`, nem `application/`, nem `domain/ports/` — ele
 * guarda o `DomainError` que a §2 OBRIGA todo erro de negócio a estender, e o embrulho `remote()`
 * que a `remote-errors.test.ts` exige em toda chamada. Alcançá-lo não é atravessar fronteira;
 * é usar a base.
 *
 * Escrito assim, por descoberta e não por lista: a primeira versão deste arquivo tratava `shared`
 * como contexto e acusou dez violações que eram o funcionamento correto da camada.
 */
const all = readdirSync(`${repoRoot}${SERVICES}`, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
const CONTEXTS = all.filter((name) => existsSync(`${repoRoot}${SERVICES}${name}/index.ts`))
const SHARED = all.filter((name) => !CONTEXTS.includes(name))

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`)
      else if (entry.name.endsWith('.ts')) out.push(`${dir}${entry.name}`)
    }
  }
  walk(SERVICES)
  return out
}

const files = sourceFiles()
const code = new Map(files.map((f) => [f, stripComments(read(f))]))

/** As linhas de `import`/`export … from` de um arquivo, já sem comentário. */
const importsOf = (file: string) => [...(code.get(file) ?? '').matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1])

describe('a camada de serviços não conhece o app (§1, §5)', () => {
  it('nenhum arquivo importa React, rota, componente ou o `apps/web`', () => {
    // O que está em jogo é a testabilidade no runner do Node, que não tem DOM: um serviço que
    // importe React deixa de rodar em `pnpm check` — e a rule diz por quê em uma frase que vale
    // mais que a proibição: "se um serviço precisa de React, ele não é um serviço".
    const offenders = files.filter((f) => importsOf(f).some((s) => /^react($|\/)|^@tanstack\/react-|^@wlet\/ui($|\/)/.test(s)))
    assert.deepEqual(offenders, [])
  })

  it('e ninguém alcança `apps/web/src/lib/` — a metade do kernel que é SÓ da tela', () => {
    // A §5 parte o kernel em dois e a linha divisória é o ponto: `buildForecast`, `settleAll` e
    // `summarizeByMonth` vivem no app porque a tela é quem os usa. Precisar de um deles dentro de
    // um serviço não é motivo para abrir o caminho — é sinal de que ou a função está no pacote
    // errado, ou o serviço está fazendo o que não é dele. O contexto `config` é a referência viva:
    // ele guarda e valida a ENTRADA da previsão e não a calcula, porque um segundo cálculo
    // produziria um segundo número para o mesmo mês.
    const offenders = files.filter((f) => importsOf(f).some((s) => s.startsWith('@/') || s.includes('apps/web')))
    assert.deepEqual(offenders, [], 'o alias `@/` é de `apps/web`; um pacote que se refira por ele deixa de poder ser lido fora do app (§8)')
  })
})

describe('o barrel é a superfície pública, e só isso (§1, §4)', () => {
  it('o `index.ts` de cada contexto SÓ reexporta', () => {
    // Havia fábricas de conveniência — `makeXService()` sem argumento, que escolhiam o
    // armazenamento por dentro. Com o servidor como origem única elas teriam de INVENTAR a URL, e
    // foi por isso que saíram: quem monta é o composition root, o único que a conhece. Uma
    // fábrica que volte ao barrel recria exatamente o acoplamento que a migração desfez.
    const declaring = CONTEXTS.map((c) => `${SERVICES}${c}/index.ts`).filter((f) => /^\s*(export\s+(async\s+)?function|export\s+const|export\s+class|const|function)\s/m.test(code.get(f) ?? ''))
    assert.deepEqual(declaring, [], 'nem lógica nem fábrica no barrel — só reexport')
  })

  it('um contexto não alcança o INTERIOR de outro por caminho profundo', () => {
    // "Se a capacidade é pública, ela é reexportada no `index.ts`; se não é reexportada, ela não é
    // pública." Um `../config/infrastructure/...` não estoura nada e é o começo de dois contextos
    // que não podem mais ser lidos separados.
    const deep: string[] = []
    for (const file of files) {
      const mine = file.slice(SERVICES.length).split('/')[0]
      for (const spec of importsOf(file)) {
        const other = spec.match(/^\.\.\/(?:\.\.\/)*([^/]+)\/(domain|application|infrastructure|test-support)\//)
        if (other && other[1] !== mine && CONTEXTS.includes(other[1])) deep.push(`${file} → ${spec}`)
      }
    }
    assert.deepEqual(deep, [], 'cross-context pelo barrel `index.ts` do contexto de origem')
  })
})

describe('a porta é a costura, e o caso de uso não sabe o que há atrás (§6)', () => {
  it('nenhum `application/` importa de `infrastructure/`', () => {
    // O caso de uso recebe o adapter pelas deps da factory. Importá-lo direto não quebra teste —
    // quebra a troca: foi a ausência desse import que permitiu substituir os cinco armazenamentos
    // por oRPC sem os casos de uso mudarem uma linha.
    const offenders = files.filter((f) => f.includes('/application/') && importsOf(f).some((s) => s.includes('infrastructure/')))
    assert.deepEqual(offenders, [])
  })

  it('`domain/ports/` não exporta VALOR — só interface e tipo', () => {
    // Um port que carregue implementação deixa de ser port: quem o importa passa a depender do
    // que ele faz, e não do que ele promete.
    const offenders = files.filter((f) => f.includes('/domain/ports/') && /^export\s+(const|function|class|let)\s/m.test(code.get(f) ?? ''))
    assert.deepEqual(offenders, [])
  })
})

describe('o dublê não vaza para produção, e não sorteia (§9)', () => {
  it('fake e builder vivem SÓ em `test-support/`', () => {
    // `test-support/` não é produção. Um fake alcançável pelo barrel é um armazenamento a mais no
    // contexto, que a §7 proíbe por si só — e este é silencioso porque o fake FUNCIONA.
    const offenders = files.filter((f) => !f.includes('/test-support/') && /\b(fake|Fake|stub|Stub)[A-Z(]/.test(code.get(f) ?? ''))
    assert.deepEqual(offenders, [])
  })

  it('e `test-support/` é determinístico — sem relógio, sem acaso', () => {
    // O modo de falha aqui é o pior de todos: o teste passa 99 vezes em 100. O relógio entra pela
    // porta, como dependência — é o mesmo motivo de `IdGenerator` existir.
    const offenders = files.filter((f) => f.includes('/test-support/') && /Date\.now\(\)|new Date\(\s*\)|Math\.random\(\)/.test(code.get(f) ?? ''))
    assert.deepEqual(offenders, [])
  })
})

describe('o sensor alcança a camada que diz alcançar', () => {
  it('varreu os cinco contextos e achou arquivo em cada um', () => {
    // A guarda que todo sensor de fonte precisa: um `readdirSync` que devolva lista vazia deixa
    // TODAS as afirmações acima verdes sem ter lido uma linha.
    assert.ok(files.length > 30, `esperava a camada inteira, li ${files.length} arquivos`)
    for (const context of CONTEXTS)
      assert.ok(
        files.some((f) => f.startsWith(`${SERVICES}${context}/`)),
        `nenhum arquivo lido em ${context}`,
      )
    assert.deepEqual(CONTEXTS.sort(), ['config', 'dataset', 'overrides', 'plans', 'preferences'])
  })

  it('e sabe qual pasta é base comum, e não contexto', () => {
    // Presa porque é a distinção da qual a §4 depende: promover `shared` a contexto faz o sensor
    // acusar dez usos corretos, e rebaixar um contexto a base o faz calar sobre os errados.
    assert.deepEqual(SHARED, ['shared'])
  })
})
