/**
 * Prepara um clone recém-feito: cria os `*.config.ts` que faltam a partir dos `.example` e,
 * se `src/generated/` estiver vazio, gera um dataset fictício para o app abrir.
 *
 * Os `*.config.ts` carregam nome, número de conta, salário e metas — dado pessoal —, então
 * são ignorados pelo git e só o `.example` viaja no repositório. Este script é o que fecha
 * essa lacuna sem obrigar ninguém a copiar quatro arquivos à mão.
 *
 * É idempotente: nada que já exista é sobrescrito. Rodar de novo não apaga configuração.
 */
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GENERATED = join(HERE, '..', 'src', 'generated')

const CONFIGS = ['accounts.config.ts', 'rules.config.ts', 'planned.config.ts', 'receivables.config.ts', 'goals.config.ts', 'budget.config.ts', 'trips.config.ts']

let copied = 0
for (const name of CONFIGS) {
  const target = join(HERE, name)
  if (existsSync(target)) continue
  copyFileSync(join(HERE, name.replace('.config.ts', '.config.example.ts')), target)
  console.log(`criado scripts/${name} a partir do modelo`)
  copied += 1
}
if (copied === 0) console.log('configs já existem, nada copiado')

const hasData = existsSync(GENERATED) && readdirSync(GENERATED).some((file) => file.endsWith('.json'))
if (hasData) {
  console.log('src/generated/ já tem dados, seed não executado')
} else {
  // Importado só agora: o seed lê os `*.config.ts` no topo do módulo, e eles podem
  // ter acabado de ser criados acima.
  await import('./seed.ts')
}

console.log('\nPronto. `pnpm dev` abre o app com os dados que estiverem em src/generated/.')
console.log('Para usar seus extratos: coloque os arquivos em docs/, ajuste scripts/accounts.config.ts e rode `pnpm ingest`.')
