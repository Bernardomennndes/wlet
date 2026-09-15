import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { repoRoot, stripComments } from './support/source-fields'

/**
 * A coluna que existe no SCHEMA e não existe no BANCO de quem não é você.
 *
 * O Drizzle separa as duas coisas: `schema/*.ts` é o que o código enxerga, e `drizzle/*.sql` é o
 * que o banco recebe. Acrescentar uma coluna ao schema e esquecer de gerar a migração não quebra
 * NADA na sua máquina — o seu banco já tem a coluna, porque você a criou com `db:push` ou porque a
 * gerou e não commitou. Compila, os testes passam, e o defeito estreia no banco de produção como
 * `column "x" does not exist` em toda requisição que tocar aquela tabela.
 *
 * O mesmo vale para o JOURNAL, que é o que o Drizzle lê para saber o que rodar: uma migração sem
 * entrada nunca roda, e uma entrada sem arquivo derruba o `db:migrate` no arranque. As três peças
 * — `.sql`, entrada e snapshot — nascem juntas de um `drizzle-kit generate` e se separam no
 * primeiro `git add` parcial.
 */
const DRIZZLE = 'packages/db/drizzle'
const SCHEMA = 'packages/db/src/schema'

const ler = (relative: string) => readFileSync(`${repoRoot}${relative}`, 'utf8')
const migracoes = () =>
  readdirSync(`${repoRoot}${DRIZZLE}`)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort()
const journal = () => JSON.parse(ler(`${DRIZZLE}/meta/_journal.json`)) as { entries: { idx: number; tag: string }[] }

describe('as três peças de uma migração andam juntas', () => {
  it('há migração sendo lida', () => {
    assert.ok(migracoes().length >= 3, `só ${migracoes().length} migrações encontradas`)
  })

  it('todo `.sql` tem entrada no journal, e toda entrada tem `.sql`', () => {
    // Entrada sem arquivo derruba o `db:migrate` no arranque; arquivo sem entrada é pior, porque
    // não derruba nada — a migração simplesmente nunca roda, e o banco fica atrás em silêncio.
    assert.deepEqual(
      journal()
        .entries.map((e) => e.tag)
        .sort(),
      migracoes(),
    )
  })

  it('toda entrada tem o snapshot correspondente', () => {
    // O snapshot é o que o `generate` seguinte compara para saber o que mudou. Sem ele, a próxima
    // migração é gerada contra um estado errado e reescreve o que já existe.
    const snapshots = new Set(readdirSync(`${repoRoot}${DRIZZLE}/meta`).filter((f) => f.endsWith('_snapshot.json')))
    const faltando = journal().entries.filter((e) => !snapshots.has(`${String(e.idx).padStart(4, '0')}_snapshot.json`))
    assert.deepEqual(
      faltando.map((e) => e.tag),
      [],
    )
  })

  it('os índices são sequenciais, sem buraco', () => {
    // Um buraco significa migração apagada: quem já está adiante não percebe, e quem está atrás
    // nunca recebe aquele passo. O Drizzle ordena por índice e não reclama da falta.
    assert.deepEqual(
      journal().entries.map((e) => e.idx),
      journal().entries.map((_, i) => i),
    )
  })
})

describe('toda coluna do schema passou por uma migração', () => {
  const colunas = () => {
    const out = new Map<string, string>()
    for (const file of readdirSync(`${repoRoot}${SCHEMA}`).filter((f) => f.endsWith('.ts'))) {
      const source = stripComments(ler(`${SCHEMA}/${file}`))
      for (const match of source.matchAll(/\b(?:text|numeric|integer|boolean|jsonb|timestamp|smallint|bigint|varchar|date)\(\s*'([a-z0-9_]+)'/g)) {
        out.set(match[1], file)
      }
    }
    return out
  }

  const sql = () =>
    migracoes()
      .map((tag) => ler(`${DRIZZLE}/${tag}.sql`))
      .join('\n')

  it('o leitor acha as colunas e o SQL', () => {
    assert.ok(colunas().size >= 50, `só ${colunas().size} colunas lidas do schema`)
    assert.ok(sql().length >= 2000, 'o SQL das migrações veio curto demais')
  })

  it('nenhuma coluna declarada ficou sem chegar ao banco', () => {
    // A busca é pelo nome ENTRE ASPAS, como o Drizzle escreve no DDL — assim um nome que apareça
    // só num comentário do SQL não conta como migrado.
    const migrado = sql()
    const orfas: string[] = []
    for (const [coluna, file] of colunas()) {
      if (!new RegExp(`"${coluna}"`).test(migrado)) orfas.push(`${file}: ${coluna}`)
    }
    assert.deepEqual(orfas, [], 'coluna no schema sem migração — o banco de quem não é você não a tem')
  })
})
