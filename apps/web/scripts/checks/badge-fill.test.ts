import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Badge de valor NUNCA tem fundo cheio — a §1 de `status-badges.md`, e a razão de `enum-badge.tsx`.
 *
 * A regra existe porque numa coluna com muitas linhas no mesmo estado o preenchimento vira parede
 * de cor, e aí nenhum badge destaca nada. A cor semântica vive na BORDA e no TEXTO.
 *
 * O que torna isto um sensor e não uma preferência é uma armadilha concreta do componente: o
 * `variant` padrão do `Badge` do registry é **`default`**, que pinta `bg-primary text-primary-foreground`.
 * Escrever `<Badge>Ativo</Badge>` — a forma mais natural de escrever — produz exatamente o badge
 * preenchido que a rule proíbe, e nada avisa: `tsc` aceita (a prop é opcional), o Biome aceita, e na
 * tela aparece um bloco sólido que parece decisão de design de alguém.
 *
 * Nenhuma das outras vinte rules pega isto, e as seis sem sensor são as que ficam por conta de
 * revisão manual — esta era a que tinha invariante mecânica.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

/** O próprio componente declara as variantes; ele é a exceção óbvia. */
const REGISTRY_BADGE = 'packages/ui/src/components/badge.tsx'

function screenFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (entry.name.endsWith('.tsx') && relative !== REGISTRY_BADGE) out.push(relative)
    }
  }
  walk('apps/web/src/', 'apps/web/src/')
  walk('packages/ui/src/', 'packages/ui/src/')
  return out
}

const read = (relative: string) =>
  readFileSync(`${repoRoot}${relative}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')

/** A abertura da tag, com os atributos que ela declara. */
const badgeTags = (source: string) => [...source.matchAll(/<Badge\b([^>]*)>/g)].map((match) => match[1])

describe('badge de valor não tem fundo cheio', () => {
  const uses = new Map<string, string[]>()
  for (const relative of screenFiles()) {
    const tags = badgeTags(read(relative))
    if (tags.length) uses.set(relative, tags)
  }

  it('o varredor está olhando para o app inteiro', () => {
    assert.ok(screenFiles().length >= 100, `só ${screenFiles().length} telas varridas`)
    assert.ok(uses.size >= 2, 'nenhum uso de `<Badge>` encontrado — o padrão da busca quebrou')
  })

  it('todo `<Badge>` declara `outline`, porque o padrão do componente é PREENCHIDO', () => {
    // Omitir a prop não é neutro: `variant = 'default'` pinta `bg-primary`. É por isso que a
    // cobrança é pela presença de `outline` e não pela ausência das variantes cheias — o badge
    // que viola a rule é, quase sempre, o que não escreveu variante nenhuma.
    const wrong: string[] = []
    for (const [relative, tags] of uses) {
      for (const tag of tags) if (!/variant="outline"/.test(tag)) wrong.push(`${relative}: <Badge${tag.trimEnd()}>`)
    }
    assert.deepEqual(wrong, [], 'badge preenchido numa coluna de valores vira parede de cor (§1 de status-badges.md)')
  })
})

describe('a cor de um tom vive na borda e no texto', () => {
  const ENUM_BADGE = 'apps/web/src/components/enum-badge.tsx'
  const STATUS_BADGE = 'apps/web/src/components/status-badge.tsx'

  /** O corpo de um mapa de tom, sem os outros. */
  const mapBody = (source: string, name: string) => {
    const start = source.indexOf(`const ${name}`)
    assert.notEqual(start, -1, `${name} sumiu do módulo`)
    return source.slice(start, source.indexOf('\n}', start))
  }

  /**
   * Só as strings de classe: rótulo e nome de ícone ficam de fora.
   *
   * O `*` em vez de `+` é o conserto de um defeito que este sensor teve por três minutos, e ele
   * vale a linha: com `[^']+` a string VAZIA de `neutral: ''` não casa, o par de aspas seguinte
   * fica desalinhado, e o que a varredura devolve a partir dali é o texto ENTRE os valores em vez
   * dos valores. O sensor não acusava nada — ele lia zero tons e teria passado silencioso se a
   * contagem mínima abaixo não existisse.
   */
  const tones = (body: string) => [...body.matchAll(/'([^']*)'/g)].map((match) => match[1]).filter((value) => /border-|text-|bg-/.test(value))

  it('nenhum tom pinta fundo, e todo tom com cor pinta as DUAS coisas', () => {
    // Só a borda deixa o texto do badge na cor do resto da tabela, e a diferença some no cinza;
    // só o texto perde o contorno que separa o badge da célula vizinha.
    for (const [relative, name] of [
      [ENUM_BADGE, 'TONE_CLASS'],
      [STATUS_BADGE, 'STATUS'],
    ]) {
      const found = tones(mapBody(read(relative), name))
      assert.ok(found.length >= 3, `${relative}: só ${found.length} tons lidos`)
      for (const tone of found) {
        assert.doesNotMatch(tone, /(^|\s)bg-/, `${relative}: tom com fundo — ${tone}`)
        assert.match(tone, /border-/, `${relative}: tom sem borda — ${tone}`)
        assert.match(tone, /text-/, `${relative}: tom sem cor de texto — ${tone}`)
      }
    }
  })

  it('o tom neutro é deliberadamente SEM cor', () => {
    // Um valor é neutro até que algo sobre ele diga o contrário. Pintar o neutro gastaria o
    // realce que os outros tons precisam — se toda linha está colorida, nenhuma está destacada.
    assert.match(read(ENUM_BADGE), /neutral:\s*''/, 'o tom neutro ganhou cor')
  })

  it('o badge de STATUS não passa pelo `Badge` do registry', () => {
    // Markup próprio, e não preciosismo: a variante `outline` ainda pinta `bg-input/20`, então
    // nem ela serve para um status — que é o caso em que o fundo transparente é a regra.
    assert.doesNotMatch(read(STATUS_BADGE), /from\s+'@wlet\/ui\/components\/badge'/, 'status com o Badge do registry ganha fundo mesmo em `outline`')
  })
})
