import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { read, repoRoot, stripComments } from './support/source-fields'

/**
 * A LISTA — a alternativa à data table, e a rule que não tinha sensor nenhum.
 *
 * `data-list.md` diz o que está em jogo numa frase: "a semântica é METADE da razão de escolher
 * lista, não um detalhe de acabamento". Com `<ul>` o leitor de tela anuncia "lista, 9 itens" e
 * oferece navegação item a item — que é exatamente a leitura que a escolha por lista pressupõe.
 * Uma pilha de `<div>` com a mesma aparência não anuncia nada, e aí a lista só perdeu os recursos
 * da tabela sem ganhar nada em troca.
 *
 * O que torna isso digno de sensor é o ALCANCE: a §4 registra que "a §2 é cumprida no componente e
 * não em cada tela". Nove telas dependem de cinco tags dentro de um arquivo. Quem "simplificar"
 * `data-list.tsx` para `<div>` derruba as nove de uma vez, com pixels idênticos e sem quebrar
 * nada — é a mudança que mais parece inofensiva e mais custa.
 *
 * Fora daqui, de propósito: `aria-label` no `DataList` e `label` no `DataListField` são
 * OBRIGATÓRIOS pela rule e já são obrigatórios pelo TIPO do componente — o `tsc` recusa a chamada
 * sem eles antes de qualquer teste. Sensor que repete o compilador é ruído.
 */
const COMPONENT = 'apps/web/src/components/data-list/data-list.tsx'
const source = stripComments(read(COMPONENT))

describe('a lista é uma LISTA de verdade (§2)', () => {
  it('as cinco tags semânticas estão no componente, cada uma no seu lugar', () => {
    // Presas por PAR — peça e tag —, e não por presença solta: um `<ul>` que sobrevivesse num
    // canto do arquivo enquanto `DataListItem` virasse `<div>` deixaria um grep ingênuo verde.
    const renders = (fn: string, tag: string) => {
      const at = source.indexOf(`export function ${fn}(`)
      assert.notEqual(at, -1, `${fn} sumiu de ${COMPONENT}`)
      const next = source.indexOf('export function ', at + 1)
      const block = source.slice(at, next === -1 ? undefined : next)
      assert.match(block, new RegExp(`<${tag}[\\s>]`), `${fn} precisa renderizar <${tag}>: é o que faz o leitor de tela anunciar a lista`)
    }
    renders('DataList', 'ul')
    renders('DataListItem', 'li')
    renders('DataListItemFields', 'dl')
    renders('DataListField', 'dt')
    renders('DataListField', 'dd')
  })

  it('o `<dt>` e o `<dd>` saem JUNTOS do mesmo campo', () => {
    // Um `<dd>` sem `<dt>` irmão é valor órfão: a rule existe para o leitor ouvir "Cobertura,
    // 09/01/2026" em vez de dois textos soltos, e meio par não produz isso.
    const at = source.indexOf('export function DataListField(')
    const block = source.slice(at)
    assert.ok(block.indexOf('<dt') !== -1 && block.indexOf('<dd') !== -1, 'o par rótulo/valor é o motivo do componente existir')
    assert.ok(block.indexOf('<dt') < block.indexOf('<dd'), 'o rótulo vem antes do valor')
  })
})

describe('a moldura e o divisor moram num lugar só (§3)', () => {
  it('o componente traz o `divide-y` e UMA moldura', () => {
    // "O traço só existe ENTRE itens": o primeiro não ganha linha em cima, o último não ganha
    // embaixo, e a aresta externa é a borda do card. É o `divide-y` que produz isso — trocá-lo
    // por uma borda por item duplica a linha entre vizinhos, e a diferença é de 1px.
    const at = source.indexOf('export function DataList(')
    const block = source.slice(at, source.indexOf('export function ', at + 1))
    assert.match(block, /divide-y/)
    assert.match(block, /ring-1|border\b/, 'a aresta externa da lista')
  })

  it('nenhuma tela põe vão entre os itens nem `<Card>` por item', () => {
    // O vão transforma os itens em cartões soltos e a lista deixa de ler como um bloco. Como o
    // `className` da `DataList` chega ao `<ul>` por `cn`, um `space-y-*` ali vence o `divide-y`
    // sem aviso — e a tela continua plausível.
    const offenders: string[] = []
    for (const file of screens()) {
      const text = stripComments(read(file))
      for (const open of text.matchAll(/<DataList\s[^>]*>/g)) {
        if (/className="[^"]*(?:space-y-|gap-y-|\bgap-\d)/.test(open[0])) offenders.push(`${file} → ${open[0].trim()}`)
      }
      if (/<DataListItem\b[^>]*>\s*<Card/.test(text)) offenders.push(`${file} → <Card> por item`)
    }
    assert.deepEqual(offenders, [])
  })
})

/**
 * As telas que usam a lista, LIDAS do disco.
 *
 * Varrer é o ponto: uma lista escrita à mão aqui envelheceria junto com a §4 da rule, que é
 * exatamente o defeito que este arquivo existe para prender.
 */
function screens(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`)
      else if (entry.name.endsWith('.tsx') && stripComments(read(`${dir}${entry.name}`)).includes('<DataList')) out.push(`${dir}${entry.name}`)
    }
  }
  walk('apps/web/src/routes/')
  walk('apps/web/src/components/')
  return out.sort()
}

describe('o inventário da §4 é MEDIDO, e continua batendo', () => {
  it('as nove telas que a rule declara são as nove que existem', () => {
    // A rule diz "inventário MEDIDO deste projeto: nove telas", e um número escrito à mão numa
    // rule apodrece calado — quem ler vai procurar a décima e concluir que a regra não vale.
    // A própria §4 registra o precedente: a lista que ela trazia antes era do projeto de ORIGEM,
    // "três telas de programas e acessos que não existem aqui".
    assert.deepEqual(screens(), [
      'apps/web/src/routes/-components/monthly-list.tsx',
      'apps/web/src/routes/cobrancas/-content.tsx',
      'apps/web/src/routes/contas/-content.tsx',
      'apps/web/src/routes/pagamentos/-content.tsx',
      'apps/web/src/routes/patrimonio/-content.tsx',
      'apps/web/src/routes/previsao/-components/forecast-list.tsx',
      'apps/web/src/routes/previsao/-content.tsx',
      'apps/web/src/routes/rubricas/-components/rubric-list.tsx',
      'apps/web/src/routes/transferencias/-content.tsx',
    ])
  })

  it('e a exceção da §3.1 não tem nenhum caso vivo — o precedente que a rule citava não era um', () => {
    // A §3.1 dispensa a moldura de quem "já é um bloco emoldurado", e apontava
    // `rubric-list.tsx` como precedente vivo. Não é: aquele item não passa `className` nenhum,
    // então ganha a moldura padrão — e, pelo critério OBJETIVO da própria seção ("ele tem borda
    // por dentro?"), está certo. O bloco aninhado dele é um `border-l`, um TRILHO, e o código diz
    // isso em comentário: "o rail à esquerda diz 'isto pertence à rubrica de cima' sem moldura
    // nem título". Trilho não é moldura, e três retângulos aninhados é o que a seção evita.
    //
    // Fica preso como conjunto VAZIO, e não apagado: no dia em que uma tela dispensar a moldura,
    // este teste fica vermelho e obriga a §3.1 a ganhar o precedente que ela nunca teve.
    const dispensam = screens().filter((f) => [...stripComments(read(f)).matchAll(/<DataList\s[^>]*>/g)].some((m) => /className="[^"]*(?:ring-0|border-0|border-none)/.test(m[0])))
    assert.deepEqual(dispensam, [])
  })
})
