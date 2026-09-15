import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * A TOOLBAR de filtros — e a rule que dizia não valer aqui.
 *
 * `listing-filters.md` traz duas frases que se contradizem: o cabeçalho nomeia "os três filtros de
 * `/transacoes`" como referência viva, e o parágrafo seguinte diz "não há toolbar por tabela; esta
 * rule só passa a valer se alguma tela ganhar filtro próprio". A tela ganhou — e são QUATRO
 * (conta, categoria, tipo, mês), não três. A rule vale, e valia desde antes de eu olhar.
 *
 * O que está em jogo é o que a §1 exige: mesma ALTURA e mesmo FUNDO para todos os filtros de uma
 * toolbar. Um `h-9` ao lado de `h-8` não quebra nada — some no code review, porque a linha do
 * `className` parece igual às vizinhas, e aparece na tela como um degrau de 4px que ninguém sabe
 * de onde veio. A defesa é o COMPONENTE: `AppCombobox` já é `h-8` por herdar o `Button`, e o
 * `className` ali serve só para largura.
 */
const GLOBAL_FILTERS = 'apps/web/src/components/layout/app-shell.tsx'

/** Toda tela de rota, lida do disco — a lista escrita à mão envelheceria junto com a rule. */
function routes(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`)
      else if (entry.name.endsWith('.tsx')) out.push(`${dir}${entry.name}`)
    }
  }
  walk('apps/web/src/routes/')
  return out
}

/**
 * As chamadas de `AppCombobox` de um arquivo, INTEIRAS.
 *
 * O `(?:[^>]|=>)*?` não é preciosismo: com `[^>]*` a captura para no `>` da ARROW FUNCTION de
 * `onValueChange={(v) => set('mes', v)}`, e o `className` — que vem depois — some. Escrito assim, o
 * teste de altura ficava verde com o defeito aplicado, e o de `aria-label` só falhava por sorte,
 * porque o atributo vem ANTES da seta. Descoberto na falsificação, que é para isso que ela serve.
 */
const combos = (file: string) => [...stripComments(read(file)).matchAll(/<AppCombobox\s(?:[^>]|=>)*?\/>/g)].map((m) => m[0])

describe('o filtro de opções é sempre o COMBOBOX daqui (§2)', () => {
  it('nenhuma tela usa `Select` cru como filtro de listagem', () => {
    // A §2 proíbe o `Select` cru em listagem porque ele não tem busca: o filtro de categoria tem 33
    // opções, e rolar 33 itens para achar "Educação" é o defeito que o `AppCombobox` existe para
    // resolver — ele dobra acento e caixa, então "educacao" encontra "Educação".
    //
    // Em FORMULÁRIO o `Select` cru segue válido para conjunto fechado, e é por isso que a busca
    // abaixo pede a vizinhança de um filtro: `id="filtro-…"` é a marca que separa os dois usos.
    const offenders: string[] = []
    for (const file of routes()) {
      const text = stripComments(read(file))
      for (const open of text.matchAll(/<Select\s[^>]*id="filtro-[^"]*"/g)) offenders.push(`${file} → ${open[0]}`)
    }
    assert.deepEqual(offenders, [])
  })
})

describe('todos os filtros da mesma toolbar têm a MESMA altura e o MESMO fundo (§1)', () => {
  it('nenhum `className` de filtro carrega altura, fundo ou cor', () => {
    // É a `component-construction.md` §6 aplicada ao filtro: quem precisa de outra altura padrão
    // ajusta a VARIANTE no design system, nunca a tela. Sobrepor por `className` conserta uma
    // toolbar e deixa as outras divergirem — e o próximo filtro nasce copiando o vizinho errado.
    const offenders: string[] = []
    for (const file of routes()) {
      for (const open of combos(file)) {
        const cls = open.match(/className="([^"]*)"/)?.[1] ?? ''
        const banned = cls.split(/\s+/).filter((token) => /^(h-|min-h-|max-h-|bg-|text-\[)/.test(token))
        if (banned.length) offenders.push(`${file} → ${banned.join(' ')}`)
      }
    }
    assert.deepEqual(offenders, [], 'o `className` do filtro é só largura/layout')
  })

  it('e todo filtro tem `aria-label` — o rótulo visível é `sr-only` (§3)', () => {
    // A toolbar de `/transacoes` põe o `FieldLabel` em `sr-only` para caber numa linha. Isso deixa
    // o combobox SEM nome acessível visível, e o `aria-label` é o que o substitui: sem ele o leitor
    // de tela anuncia quatro caixas idênticas, e o filtro deixa de ser usável por quem não vê a
    // ordem das colunas.
    const offenders: string[] = []
    for (const file of routes()) {
      for (const open of combos(file)) {
        if (/id="filtro-/.test(open) && !/aria-label="/.test(open)) offenders.push(`${file} → ${open.slice(0, 80)}`)
      }
    }
    assert.deepEqual(offenders, [])
  })
})

describe('o inventário da rule bate com a tela (§0)', () => {
  it('os filtros GLOBAIS são escopo e período, e vivem no `app-shell`', () => {
    // A decisão registrada no `CLAUDE.md`: escopo e período valem em todas as telas. Se eles
    // migrarem para dentro de uma tela, a rule inteira muda de assunto.
    const shell = stripComments(read(GLOBAL_FILTERS))
    assert.match(shell, /MonthPicker/, 'o período')
    assert.match(shell, /SCOPES|setScope/, 'o escopo')
  })

  it('e `/transacoes` é a única tela com toolbar própria — com QUATRO filtros, não três', () => {
    // A rule afirmava "não há toolbar por tabela". Havia. O número fica preso porque foi ele que
    // denunciou a frase: quem lesse "três" e contasse quatro concluiria que a rule é velha, em vez
    // de que a tela cresceu.
    const withToolbar = routes().filter((f) => combos(f).some((c) => /id="filtro-/.test(c)))
    assert.deepEqual(withToolbar, ['apps/web/src/routes/transacoes/-content.tsx'])
    assert.equal(combos(withToolbar[0]).filter((c) => /id="filtro-/.test(c)).length, 4)
  })
})
