import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { loadRootEnv, workspaceRoot } from '@wlet/env'

/**
 * A raiz do workspace tem de ser encontrada TAMBÉM quando quem carrega o módulo é CommonJS.
 *
 * `workspaceRoot()` usava `import.meta.dirname` como valor padrão do parâmetro. O `drizzle-kit`
 * compila o `drizzle.config.ts` com um transformador próprio e o executa por `Module._compile`, onde
 * `import.meta` não existe: a propriedade virava `undefined`, o padrão recebia `undefined`, e o
 * `join(undefined, …)` estourava com `The "path" argument must be of type string`.
 *
 * **O custo do diagnóstico foi o ponto.** A mensagem não menciona `import.meta`, nem `@wlet/env`,
 * nem o arquivo de configuração — ela sai depois de "Reading config file" e some. A leitura óbvia
 * era "o CLI do drizzle-kit está quebrado", e `generate` e `migrate` ficaram inutilizáveis, com uma
 * migration escrita à mão e um segundo caminho de `db:migrate` criado para contornar. Os dois saíram
 * quando a causa apareceu.
 */
/**
 * Mora em `apps/api/tests/` e não na suíte do app WEB, e a razão é de dependência: `@wlet/env` é
 * Node-only, e `apps/api` já o consome — pôr o teste do outro lado obrigaria o app do navegador a
 * declarar uma dependência que ele não usa, só para testá-la.
 */
describe('a raiz do workspace', () => {
  it('é encontrada a partir do próprio pacote', () => {
    const root = workspaceRoot()
    assert.ok(root, 'não achou a raiz')
    assert.ok(workspaceRoot()?.length, 'raiz vazia')
  })

  it('devolve null em vez de ESTOURAR quando o ponto de partida não é caminho', () => {
    // É a diferença entre um erro diagnosticável e o que aconteceu: `join(undefined, …)` estoura com
    // uma mensagem que não diz de onde veio. `null` é um estado que quem chama sabe interpretar.
    assert.equal(workspaceRoot(undefined as unknown as string), workspaceRoot(), 'undefined cai no padrão')
    assert.equal(workspaceRoot('' as string), null)
    assert.equal(workspaceRoot(null as unknown as string), null)
  })

  it('não acha raiz acima do sistema de arquivos', () => {
    assert.equal(workspaceRoot('/'), null)
  })

  it('loadRootEnv devolve os arquivos que leu', () => {
    const lidos = loadRootEnv()
    // Arquivo ausente não é erro — um clone recém-feito ainda não tem `.env`. O que importa é que
    // cada caminho devolvido termine em `.env` ou `.env.local`, na ordem de precedência.
    for (const caminho of lidos) assert.match(caminho, /\.env(\.local)?$/)
  })
})

/**
 * E o `drizzle-kit` carrega a configuração — a regressão, de ponta a ponta.
 *
 * Este é o teste que de fato tranca o defeito: ele roda o CLI, que compila um `.ts` de configuração
 * com transformador próprio e o executa como **CommonJS**, chamando `loadRootEnv()` de lá. Com o bug
 * de volta, o comando morre antes de olhar o schema, com `must be of type string`.
 *
 * **A configuração é uma CÓPIA temporária, e ela precisa morar em `packages/db`.** Duas razões, as
 * duas medidas: passar `--out` para o `generate` faz o CLI ignorar o arquivo de configuração inteiro
 * (ele responde "Please provide required params: schema, dialect"), então o `out` tem de vir de
 * dentro; e um arquivo em `/tmp` não resolveria `@wlet/env` nem `./src/schema`. A cópia sai no
 * `finally`, e o `out` dela aponta para um descartável — contra um diretório vazio o `generate`
 * escreve a migration inicial inteira, e mandá-la para `drizzle/` sujaria o histórico a cada
 * execução da suíte.
 */
describe('o drizzle-kit carrega a configuração', () => {
  it('generate roda sem estourar na leitura do .env', () => {
    const db = fileURLToPath(new URL('../../../packages/db/', import.meta.url))
    const saida = mkdtempSync(join(tmpdir(), 'wlet-drizzle-'))
    const copia = join(db, 'drizzle.config.probe.ts')
    writeFileSync(
      copia,
      [
        "import { loadRootEnv } from '@wlet/env'",
        "import { defineConfig } from 'drizzle-kit'",
        '',
        '// A MESMA chamada do arquivo de verdade, e é ela que estourava sob o transformador CJS.',
        'loadRootEnv()',
        '',
        'export default defineConfig({',
        "  schema: './src/schema/index.ts',",
        `  out: ${JSON.stringify(saida)},`,
        "  dialect: 'postgresql',",
        "  dbCredentials: { url: process.env.DATABASE_URL ?? '' },",
        '})',
        '',
      ].join('\n'),
    )
    try {
      const log = execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate', '--config', copia], { cwd: db, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      assert.doesNotMatch(log, /must be of type string/, 'o config voltou a estourar na leitura do .env')
      assert.match(log, /receivables/, 'o CLI não chegou a ler o schema')
    } finally {
      rmSync(copia, { force: true })
      rmSync(saida, { recursive: true, force: true })
    }
  })
})
