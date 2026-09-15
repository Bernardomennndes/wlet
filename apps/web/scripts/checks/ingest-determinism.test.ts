import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * O MESMO `docs/` PRODUZ O MESMO RESULTADO — a promessa, e as duas portas por onde ela escapa.
 *
 * `IngestInput.now` existe por causa de um defeito medido, e o `pipeline.ts` o registra: o
 * `meta.generatedAt` saía de `new Date()` dentro do pipeline, e com isso duas ingestões da mesma
 * pasta produziam JSON diferentes. `pipeline.test.ts` prende o conserto pelo comportamento.
 *
 * O que ninguém media é se o relógio voltou por outra porta. Ele voltou por duas, e as duas são
 * fallback de último recurso — o que as torna piores, não melhores: elas só entram quando o nome do
 * arquivo não traz data, que é justamente quando ninguém está olhando.
 *
 * Este sensor não as conserta. Ele impede a TERCEIRA: um `new Date()` novo em `packages/ingest`
 * fica vermelho, e quem o escrever decide de frente se é fallback declarado ou defeito.
 */
const INGEST = 'packages/ingest/src/'

/**
 * As escapatórias que EXISTEM hoje, nomeadas com o que custam.
 *
 * A lista é de linhas de código, não de arquivos: um arquivo inteiro anistiado esconderia o
 * próximo. Cada entrada é o trecho exato, e mudar a linha derruba o teste — o que é o desejado,
 * porque quem a mexe deve reler o custo.
 */
const ESCAPES: { file: string; code: string; why: string }[] = [
  {
    file: 'parsers.ts',
    code: 'const dueYear = due ? Number(due[1]) : new Date().getFullYear()',
    why: 'fatura do Nubank sem `AAAA-MM-DD` no nome: o ANO de toda compra dela vem do relógio, e a mesma pasta lida em dois anos produz conjuntos distintos. Provado em `nubank-invoice.test.ts`.',
  },
  {
    file: 'investments.ts',
    code: 'const asOf = /(\\d{4}-\\d{2}-\\d{2})/.exec(positionFile)?.[1] ?? cdi.at(-1)?.date ?? new Date().toISOString().slice(0, 10)',
    why: 'terceiro da cadeia: só entra sem data no nome do relatório de posição E sem cache de CDI — e a ausência do CDI já vira `problems`, então o número não deveria ser publicado de qualquer forma.',
  },
]

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`)
      else if (entry.name.endsWith('.ts')) out.push(`${dir}${entry.name}`)
    }
  }
  walk(INGEST)
  return out
}

/** As linhas de um arquivo que tocam relógio ou acaso, já sem comentário. */
const clockLines = (file: string) =>
  stripComments(read(file))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /new Date\(\s*\)|Date\.now\(\)|Math\.random\(\)/.test(line))

describe('o ingest não consulta o relógio, salvo onde está declarado', () => {
  it('nenhuma linha nova toca `new Date()`, `Date.now()` ou `Math.random()`', () => {
    const declared = new Set(ESCAPES.map((e) => e.code))
    const found: string[] = []
    for (const file of sourceFiles()) {
      for (const line of clockLines(file)) if (!declared.has(line)) found.push(`${file}: ${line}`)
    }
    assert.deepEqual(found, [], 'passe o instante pela porta (`IngestInput.now`), ou declare a escapatória em ESCAPES com o que ela custa')
  })

  it('e toda escapatória declarada ainda EXISTE no arquivo que ela nomeia', () => {
    // O lado esquecido da lista: uma entrada que sobreviveu ao conserto anistia uma linha que já
    // não há, e dá a impressão de que o assunto foi tratado. Se alguém passar `now` até o parser,
    // esta afirmação fica vermelha e obriga a tirar o item daqui e do caderno.
    const missing = ESCAPES.filter((e) => !clockLines(`${INGEST}${e.file}`).includes(e.code))
    assert.deepEqual(
      missing.map((e) => `${e.file}: ${e.code}`),
      [],
      'a escapatória sumiu — tire-a de ESCAPES e de "Débitos em aberto"',
    )
  })

  it('e cada uma diz o que custa, em vez de só existir', () => {
    // Uma anistia sem motivo escrito é a forma mais fácil de uma exceção virar regra.
    for (const e of ESCAPES) assert.ok(e.why.length > 60, `${e.file}: o porquê precisa dizer o efeito, não só "é fallback"`)
  })
})

describe('o sensor alcança o pacote que diz alcançar', () => {
  it('leu o `packages/ingest` inteiro', () => {
    const files = sourceFiles()
    assert.ok(files.length >= 10, `esperava o pacote inteiro, li ${files.length} arquivos`)
    for (const name of ['pipeline.ts', 'parsers.ts', 'investments.ts', 'brokerage.ts']) {
      assert.ok(files.includes(`${INGEST}${name}`), `${name} ficou de fora da varredura`)
    }
  })
})
