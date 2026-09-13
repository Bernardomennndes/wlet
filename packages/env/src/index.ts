import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * O `.env` do WLET é UM, e mora na raiz do workspace.
 *
 * Cada pacote roda com o `cwd` na PRÓPRIA pasta — `pnpm --filter @wlet/api-server dev` entra em
 * `apps/api/` antes de executar —, então qualquer leitura relativa ao `cwd` procuraria um
 * `apps/api/.env` que não existe. Um arquivo por pacote resolveria isso e traria de volta o
 * problema que o monorepo veio resolver: a mesma `DATABASE_URL` escrita em três lugares, que
 * divergem no primeiro ajuste. A busca aqui sobe a partir DESTE arquivo até achar o
 * `pnpm-workspace.yaml`, que é a definição de "a raiz deste workspace" — assim o resultado não
 * depende de onde o comando foi disparado.
 *
 * **Não há dependência nova.** `process.loadEnvFile` é do próprio Node (20.12+) e tem a MESMA
 * precedência do `dotenv`: o que já está no ambiente GANHA do arquivo. É a ordem que importa em
 * produção — a variável real do provedor não pode ser sobrescrita por um arquivo esquecido no
 * disco — e é o que permite `DATABASE_URL=... pnpm check` continuar funcionando.
 */
const MARCADOR = 'pnpm-workspace.yaml'

/**
 * De onde a busca começa — e por que não é só `import.meta.dirname`.
 *
 * Era, e isso quebrava todo comando que carrega a sua configuração como **CommonJS**. O
 * `drizzle-kit` faz exatamente isso: ele compila o `drizzle.config.ts` com um transformador próprio
 * e o executa por `Module._compile`, onde `import.meta` não existe — a propriedade vira `undefined`,
 * o parâmetro com valor padrão recebe `undefined`, e o `join(undefined, …)` estoura com
 * `The "path" argument must be of type string`. A mensagem não menciona `import.meta`, nem este
 * pacote, nem o arquivo de configuração: por semanas a leitura foi "o CLI do drizzle-kit está
 * quebrado", e `generate` e `migrate` ficaram inutilizáveis.
 *
 * As quatro fontes, em ordem de precisão. `import.meta.url` cobre o ESM em que `dirname` não exista;
 * `__dirname` cobre o CJS de verdade; o `cwd` é o último recurso — pior que os outros porque depende
 * de onde o comando foi disparado, mas melhor que estourar, já que a busca SOBE e o `cwd` de
 * qualquer pacote do monorepo chega na raiz.
 */
function origem(): string {
  if (typeof import.meta.dirname === 'string') return import.meta.dirname
  // `import.meta.url` existe em ESM mesmo onde `dirname` não foi implementado; sob o transformador
  // CJS do drizzle-kit ele também vira `undefined`, daí a checagem de tipo e não de verdade.
  const url: unknown = import.meta.url
  if (typeof url === 'string' && url.startsWith('file:')) return dirname(fileURLToPath(url))
  const cjs: unknown = (globalThis as { __dirname?: unknown }).__dirname
  if (typeof cjs === 'string') return cjs
  return process.cwd()
}

/**
 * A raiz do workspace, ou `null` se este código foi parar fora dele.
 *
 * O `from` é conferido em vez de confiado: ele chega de `origem()` ou de quem chamou, e um valor que
 * não seja string derruba o `join` com uma mensagem que não diz de onde veio — foi assim que o
 * defeito acima ficou escondido.
 */
export function workspaceRoot(from: string = origem()): string | null {
  if (typeof from !== 'string' || from === '') return null
  let dir = from
  for (;;) {
    if (existsSync(join(dir, MARCADOR))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Carrega o `.env` da raiz e devolve os arquivos lidos, na ordem em que foram lidos.
 *
 * **A ordem é `.env.local` ANTES de `.env`, e isso é o que dá precedência ao `.local`**: como o
 * Node não sobrescreve chave já definida, quem lê primeiro vence. É a mesma precedência do Vite,
 * de propósito — o `apps/web` lê os dois pelo `envDir`, e duas regras diferentes para os mesmos
 * dois arquivos fariam o mesmo valor significar coisas distintas conforme quem lesse.
 *
 * **Arquivo ausente não é erro.** O app sem servidor não precisa de variável nenhuma, e um clone
 * recém-feito ainda não tem `.env`: quem exige uma variável é quem depende dela, no arranque, com
 * a mensagem que diz como obtê-la.
 */
export function loadRootEnv(): string[] {
  const root = workspaceRoot()
  if (!root) return []
  const loaded: string[] = []
  for (const name of ['.env.local', '.env']) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    process.loadEnvFile(path)
    loaded.push(path)
  }
  return loaded
}
