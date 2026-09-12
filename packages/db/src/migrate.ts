import { fileURLToPath } from 'node:url'
import { loadRootEnv } from '@wlet/env'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDb } from './index'

/**
 * Aplica as migrations — e existe porque o `drizzle-kit migrate` NÃO roda aqui.
 *
 * Medido: tanto `generate` quanto `migrate` morrem com `The "path" argument must be of type
 * string. Received undefined` antes de tocar o banco, com o schema íntegro e recém-clonado. É
 * problema do CLI (ele carrega o schema por um loader deprecado, `@esbuild-kit/*`, que o `pnpm
 * install` já avisa), não da configuração — e a mensagem não diz nada sobre isso.
 *
 * O migrator PROGRAMÁTICO do `drizzle-orm` faz o mesmo trabalho sem o CLI: lê a pasta, confere a
 * tabela `__drizzle_migrations` e aplica o que falta, na ordem do journal. É o caminho que o
 * `drizzle-kit migrate` usa por baixo.
 *
 * **`generate` continua quebrado**, e isso é só inconveniente: criar uma migration nova pede o
 * CLI funcionando, ou o arquivo escrito à mão junto do snapshot e do journal (foi assim que a
 * `0001` nasceu). APLICAR, que é o que um deploy precisa, funciona por aqui.
 */
async function main(): Promise<void> {
  const lidos = loadRootEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error(`DATABASE_URL não definida${lidos.length ? ` (li ${lidos.join(', ')})` : ' e nenhum .env foi encontrado'}.`)

  const db = createDb(url)
  try {
    // O caminho é relativo a ESTE arquivo e não ao `cwd`: o comando pode ser disparado da raiz do
    // workspace ou de dentro do pacote, e um caminho relativo ao `cwd` só acharia a pasta num dos
    // dois casos.
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
    console.log('[wlet-db] migrations aplicadas')
  } finally {
    await db.close()
  }
}

await main()
