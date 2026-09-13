import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * A ausência de valor se comunica de UMA forma, e ela não é um travessão.
 *
 * A `empty-cells.md` dá duas opções e só duas: célula limpa, ou placeholder em itálico + muted. O
 * `—` está proibido por uma razão que o próprio `<NotInformed>` documenta e que nenhum revisor
 * enxerga lendo o diff: **leitor de tela não lê o travessão**, e ele não distingue "não informado"
 * de "zero" — que em várias colunas deste app são leituras OPOSTAS. Numa coluna de diferença,
 * "empatei com o previsto" e "não medi" não podem sair iguais.
 *
 * Três tinham voltado, cada um por um caminho diferente: um para zero
 * (`settlement-history.tsx`), um para nulo (`benchmark-card.tsx`) e um para CARREGANDO
 * (`dados/-content.tsx`) — o terceiro nem é ausência, é uma leitura que ainda não voltou.
 *
 * O varredor ignora comentário: eles CITAM a forma proibida para explicá-la, e contá-los acusaria a
 * explicação em vez do código. É o mesmo cuidado dos outros sensores desta pasta.
 */
const routes = new URL('../../src/', import.meta.url)

/** Todo `.tsx` de `src/`, sem comentário e sem o texto de bloco JSX. */
function sourcesOf(dir: URL, prefix = ''): [string, string][] {
  const out: [string, string][] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...sourcesOf(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`))
    else if (e.name.endsWith('.tsx')) {
      const code = readFileSync(new URL(e.name, dir), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      out.push([`${prefix}${e.name}`, code])
    }
  }
  return out
}

describe('ausência de valor', () => {
  const files = sourcesOf(routes)

  it('o varredor olha a árvore inteira', () => {
    assert.ok(files.length > 60, `só ${files.length} arquivos varridos`)
  })

  it('nenhum travessão como valor de célula, KPI ou campo', () => {
    // `'—'` e `"—"` como EXPRESSÃO. O travessão em prosa de tela (um título, uma legenda) é
    // pontuação legítima e não casa: ali ele está dentro do texto, não sozinho entre aspas.
    const offenders = files.filter(([, code]) => /(['"])—\1/.test(code)).map(([name]) => name)
    assert.deepEqual(offenders, [], 'travessão para ausência: leitor de tela não o lê, e ele não distingue "não informado" de "zero" — use célula limpa ou o <NotInformed> (empty-cells.md §1)')
  })

  it('nem "N/A", nem traço solto, nem "null" impresso', () => {
    // O traço só conta como RAMO DE TERNÁRIO (`? '-'` / `: '-'`), que é a posição de quem renderiza
    // uma ausência. Procurá-lo em qualquer aspas acusaria `split('-')` e `replace('-', '/')`, onde
    // ele é separador — três falsos positivos na primeira versão deste teste, e um sensor que
    // acusa código certo é um sensor que alguém desliga.
    const ramo = /[?:]\s*(['"])(-|null|undefined)\1/
    const naoAplicavel = /(['"])(N\/A|n\/a)\1/
    const offenders = files.filter(([, code]) => ramo.test(code) || naoAplicavel.test(code)).map(([name]) => name)
    assert.deepEqual(offenders, [], 'a §1 admite duas formas de ausência, e nenhuma delas é texto cru')
  })

  it('e o <NotInformed> segue sendo o dono da tipografia', () => {
    // A §1b proíbe reescrever o `<span italic muted>` à mão numa tela nova. A exceção é o bloco com
    // escala própria (cartão de KPI, cartão herói), onde o placeholder HERDA a tipografia do bloco —
    // e essas cópias vivem nos três arquivos abaixo, cada uma com a justificativa no lugar.
    //
    // **O padrão casa `className={…}` além de `className="…"`, e a diferença já escondia duas.** A
    // primeira versão só via a string literal, e as duas cópias declaradas aqui não estão nessa
    // forma: uma vive dentro de `cn(…)` e a outra dentro de um ternário — que é o idioma normal
    // deste código. Elas passavam invisíveis, e uma cópia NOVA escrita com `cn(…)` passaria
    // também. A lista de exceções parecia sedimento e não era; quem estava cego era o varredor.
    const excecoes = ['components/kpi/kpi-value.tsx', 'routes/patrimonio/-components/benchmark-card.tsx', 'routes/dados/-content.tsx']
    const italico = /className=\{[^}]*\bitalic\b[^}]*\}|className="[^"]*\bitalic\b[^"]*"/
    // O próprio `<NotInformed>` é o DONO da tipografia — ele não é uma cópia dela. Ficava de fora
    // por acidente enquanto o padrão só via string literal; agora sai por decisão.
    const dono = 'components/not-informed.tsx'
    const copias = files.filter(([name, code]) => name !== dono && !excecoes.includes(name) && italico.test(code) && /text-muted-foreground|--hero-muted/.test(code)).map(([name]) => name)
    assert.deepEqual(copias, [], 'placeholder de ausência escrito à mão: use <NotInformed>, ou declare a exceção aqui se o bloco tem escala própria (§1b)')
  })

  it('e cada exceção declarada AINDA é uma cópia — a lista não vira sedimento', () => {
    // Uma exceção que não descreve mais nada passa a dar licença a um arquivo que não precisa dela.
    const excecoes = ['components/kpi/kpi-value.tsx', 'routes/patrimonio/-components/benchmark-card.tsx', 'routes/dados/-content.tsx']
    const italico = /className=\{[^}]*\bitalic\b[^}]*\}|className="[^"]*\bitalic\b[^"]*"/
    const obsoletas = excecoes.filter((name) => {
      const found = files.find(([outro]) => outro === name)
      return !found || !italico.test(found[1])
    })
    assert.deepEqual(obsoletas, [], 'exceção que não corresponde mais a uma cópia: tire-a da lista')
  })
})
