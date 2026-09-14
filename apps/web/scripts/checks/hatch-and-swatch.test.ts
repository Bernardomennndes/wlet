import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * A HACHURA e o QUADRADINHO — as duas convenções de leitura do painel, e a §1 de `dataviz.md`.
 *
 * Saída é sempre hachurada, entrada é sempre sólida, e o indicador de série numa legenda é um
 * QUADRADO que reproduz a marca que identifica. As duas são convenções: valem enquanto valem em
 * TODA tela. Uma hachura com passo diferente num gráfico, ou um círculo numa legenda, não quebra
 * nada — só ensina ao olho uma regra que o resto do painel não segue, e aí nenhuma das duas lê.
 *
 * É por isso que este sensor cobra a FONTE e não a aparência: enquanto `HATCH`, `hatchBackground`
 * e `SERIES_SWATCH` forem a única origem dos números, os quatro `<pattern>` espalhados pelo app
 * continuam desenhando a mesma textura. Escrever `width={5}` à mão funciona, passa no `tsc`, passa
 * no Biome, e desliga o gráfico da convenção sem nenhum sinal.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const THEME = 'apps/web/src/components/charts/chart-theme.ts'

function appFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'generated') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (/\.tsx?$/.test(entry.name) && relative !== THEME) out.push(relative)
    }
  }
  walk('apps/web/src/', 'apps/web/src/')
  return out
}

const read = (relative: string) =>
  readFileSync(`${repoRoot}${relative}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')

describe('a hachura tem uma fonte só', () => {
  const sources = appFiles().map((relative) => [relative, read(relative)] as const)

  it('o varredor está olhando, e acha os `<pattern>` que existem', () => {
    const withPattern = sources.filter(([, source]) => source.includes('<pattern')).length
    assert.ok(sources.length >= 100, `só ${sources.length} arquivos varridos`)
    assert.ok(withPattern >= 3, `só ${withPattern} gráficos com hachura — o padrão da busca quebrou`)
  })

  it('ninguém escreve o gradiente à mão — `hatchBackground` é o caminho', () => {
    // Duas escritas do mesmo gradiente divergem no primeiro ajuste de passo, e a divergência é
    // invisível: as duas continuam parecendo hachura, só que uma mais densa que a outra.
    const inline = sources.filter(([, source]) => source.includes('repeating-linear-gradient')).map(([relative]) => relative)
    assert.deepEqual(inline, [], 'gradiente de hachura fora de `chart-theme.ts`')
  })

  it('toda hachura gira −45°, e o ângulo não é escolha de quem desenha', () => {
    // O ângulo é o que faz duas marcas serem lidas como a mesma coisa. Espelhá-lo num gráfico
    // cria uma segunda textura que o olho trata como outro significado.
    const wrong: string[] = []
    for (const [relative, source] of sources) {
      for (const match of source.matchAll(/patternTransform="([^"]*)"/g)) {
        if (match[1] !== 'rotate(-45)') wrong.push(`${relative}: ${match[1]}`)
      }
    }
    assert.deepEqual(wrong, [])
  })

  it('o passo e a espessura vêm de `HATCH`, nunca de um número digitado', () => {
    // Um `width={5}` funciona e fica igual — até alguém mexer no `HATCH` e este gráfico não
    // acompanhar. O modo de falha é a divergência silenciosa, não o erro.
    const wrong: string[] = []
    for (const [relative, source] of sources) {
      for (const match of source.matchAll(/<pattern\b([^>]*)>/g)) {
        if (!match[1].includes('HATCH.')) wrong.push(`${relative}: <pattern${match[1].trimEnd()}>`)
      }
    }
    assert.deepEqual(wrong, [], 'medida de hachura digitada em vez de lida de `HATCH`')
  })
})

describe('o indicador de série é um QUADRADO', () => {
  /**
   * Marcas pequenas o bastante para serem AMOSTRA de série. Acima disto é ícone, avatar ou botão
   * — `size-4` é o tamanho do ⓘ dos KPIs e do esqueleto do cartão, e acusá-los seria o jeito mais
   * rápido de este sensor ser desligado.
   */
  const SWATCH_SIZES = /\bsize-(1|1\.5|2|2\.5|3|3\.5)\b/

  /**
   * Marca redonda pequena que NÃO é amostra de série entra aqui, com o motivo.
   *
   * Hoje existe uma no repositório e ela está fora do escopo desta varredura de propósito: o
   * pontinho de "este mês tem dado" do `month-picker`, em `packages/ui`. Ele não identifica série
   * nenhuma — é presença de dado num calendário, e um quadrado ali leria como marca de seleção.
   */
  const ALLOWED: Record<string, string[]> = {}

  it('nenhuma amostra de série é um círculo', () => {
    // O quadradinho é amostra da marca que identifica, e as marcas deste painel são retângulos:
    // barra, fatia de pilha, segmento. O círculo obriga o olho a traduzir forma antes de casar
    // cor, e é a única forma que o gráfico não desenha em lugar nenhum.
    const round: string[] = []
    for (const relative of appFiles()) {
      for (const match of read(relative).matchAll(/'([^']*rounded-full[^']*)'/g)) {
        if (!SWATCH_SIZES.test(match[1])) continue
        if ((ALLOWED[relative] ?? []).includes(match[1])) continue
        round.push(`${relative}: ${match[1]}`)
      }
    }
    assert.deepEqual(round, [], 'indicador de série redondo (§1 de dataviz.md) — ele reproduz a marca, e a marca é retângulo')
  })

  it('e o `SERIES_SWATCH` continua quadrado', () => {
    const theme = read(THEME)
    assert.match(theme, /SERIES_SWATCH = '[^']*rounded-\[2px\]/)
    assert.doesNotMatch(theme, /SERIES_SWATCH = '[^']*rounded-full/)
  })
})
