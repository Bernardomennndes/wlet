import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { SourceFile } from '../src/lib/ingest/io.ts'

/**
 * Todo arquivo de uma pasta, com o caminho RELATIVO à raiz do projeto.
 *
 * O caminho é a IDENTIDADE do arquivo para o pipeline — `accounts.config` casa conta por
 * `pathIncludes` ('fatura/xp' distingue o cartão da conta no mesmo banco) —, então ele não pode
 * ser o caminho absoluto da máquina de quem rodou.
 *
 * Vive aqui, e não dentro do `ingest.ts`, porque o `package.ts` precisa exatamente do mesmo:
 * duas cópias divergiriam no primeiro ajuste, e a que divergisse produziria um pacote com
 * caminhos que o pipeline não reconhece.
 */
export function collect(dir: string, root: string): SourceFile[] {
  const out: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collect(full, root))
    else out.push({ path: relative(root, full), bytes: new Uint8Array(readFileSync(full)) })
  }
  return out
}
