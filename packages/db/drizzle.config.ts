import { loadRootEnv } from '@wlet/env'
import { defineConfig } from 'drizzle-kit'

// O `drizzle-kit` roda com o `cwd` em `packages/db/`, então sem isto a `DATABASE_URL` da raiz
// não chegaria e o comando falharia contra uma URL vazia — erro de conexão onde o que falta é
// configuração.
loadRootEnv()

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
