import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

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

/** A raiz do workspace, ou `null` se este código foi parar fora dele. */
export function workspaceRoot(from: string = import.meta.dirname): string | null {
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
