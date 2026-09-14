import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

/**
 * A TABELA DE ARESTAS: qual escrita invalida quais domínios.
 *
 * Uma aresta esquecida não produz erro de compilação nem teste vermelho em lugar nenhum — produz
 * TELA VELHA, que é o defeito mais difícil de atribuir a um commit: a pessoa grava, a outra tela
 * continua mostrando o número antigo, e ninguém liga uma coisa à outra. A §5.3 da regra de
 * requisição de dados pede este sensor, e ele é uma tabela porque a informação que falta não está
 * no código: é a intenção de quem escreveu.
 *
 * A comparação é POR DOMÍNIO, não pela chave literal: o que importa é a aresta, e a serialização
 * da chave é assunto do `@orpc/tanstack-query`.
 */
const EDGES = [
  {
    screen: 'configuracao/-content.tsx',
    // Teto, cobranças, metas, perfis de conta e regras — cinco seções, cinco escritas, cinco
    // frases. A regra proíbe uma fábrica que receba a mensagem por parâmetro.
    writes: 5,
    invalidates: ['config'],
  },
  {
    // Adicionar, editar e remover rubrica. Três, e não uma, porque o aviso nomeia a categoria.
    screen: 'rubricas/-content.tsx',
    writes: 3,
    invalidates: ['config'],
  },
  {
    // Excluir um previsto, e gravar um (criar ou editar, que compartilham o formulário).
    screen: 'previsao/-content.tsx',
    writes: 2,
    invalidates: ['config'],
  },
  {
    // Criar, editar e remover plano; criar e remover grupo; decidir o grupo inteiro; importar a
    // lista inteira. A invalidação de `plans` move TRÊS telas: a lista, a Visão geral e a Previsão
    // leem o mesmo cache, porque plano decidido entra nos meses futuros.
    screen: 'planos/-content.tsx',
    writes: 7,
    invalidates: ['plans'],
  },
  {
    // Ler a pasta, reprocessar o que está guardado, e importar um pacote.
    // Uma ingestão reescreve o conjunto INTEIRO, e o id de cada lançamento é `sha1` dos campos
    // dele — reprocessar pode deixar um ajuste manual órfão, então `overrides` entra na lista.
    // A importação escreve nos CINCO contextos, e todos são invalidados.
    screen: 'dados/-content.tsx',
    writes: 3,
    invalidates: ['dataset', 'overrides'],
    // A §5.1 admite `onError` PARA SUPRIMIR o aviso global numa tela com erro próprio, e esta é a
    // única que se qualifica: a mensagem vem do pipeline e nomeia o arquivo que não foi lido —
    // texto que um toast trunca justamente na parte que resolve o problema.
    ownErrorPanel: true,
  },
] as const

/**
 * O provider de filtros também grava, e ele não é uma rota — por isso entra à parte.
 *
 * Recategorizar um lançamento é a única escrita dele que ganha aviso de sucesso; recorte e período
 * não ganham, e o teste abaixo tranca essa distinção para ela não se perder como esquecimento.
 */
const FILTERS_PROVIDER = { file: 'filters.tsx', writes: 1, invalidates: ['overrides'] } as const

const root = new URL('../../src/routes/', import.meta.url)

/** Sem comentários: eles CITAM as formas proibidas para explicá-las, e contá-los acusaria a prosa. */
function codeOf(caminho: string): string {
  return readFileSync(new URL(caminho, root), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length

describe('tabela de invalidação', () => {
  for (const { screen, writes, invalidates } of EDGES) {
    it(`${screen}: ${writes} escritas, invalidando ${invalidates.join(', ')}`, () => {
      const source = codeOf(screen)
      assert.equal(count(source, /useMutation\(/g), writes, 'o número de escritas mudou — atualize a tabela e confira as arestas de cada uma')
      // Uma frase por escrita, no mínimo: a §5 exige toast de sucesso em TODA mutation, TODA vez.
      assert.ok(count(source, /toast\.success\(/g) >= writes, `${count(source, /toast\.success\(/g)} avisos de sucesso para ${writes} escritas`)
      assert.match(source, /invalidateQueries\(/, 'nenhuma invalidação')
      for (const domain of invalidates) {
        // `api().plans.key()` invalida o grupo inteiro; `api().plans.list.key()` só aquela
        // leitura. As duas vêm do contrato, que é o que a §4 exige — o que ela proíbe é a chave
        // montada à mão.
        assert.match(source, new RegExp(`api\\(\\)\\.${domain}(\\.[A-Za-z]+)?\\.key\\(\\)`), `a chave de ${domain} não vem do contrato`)
      }
    })
  }
})

/**
 * O erro é UM, no provider — e a única prova disso é não haver `onError` no ponto de uso.
 *
 * A exceção da regra é estreita: uma tela que mostre o erro num diálogo próprio passa `onError`
 * PARA SUPRIMIR o toast global. Nenhuma faz isso hoje, então a contagem esperada é zero — e o dia
 * em que alguém precisar da exceção, este teste obriga a declará-la aqui em vez de abrir o
 * precedente em silêncio.
 */
describe('o provider de filtros', () => {
  const source = readFileSync(new URL('../../src/providers/filters.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  it(`grava ${FILTERS_PROVIDER.writes} vez por useMutation, invalidando ${FILTERS_PROVIDER.invalidates.join(', ')}`, () => {
    assert.equal(count(source, /useMutation\(/g), FILTERS_PROVIDER.writes)
    for (const domain of FILTERS_PROVIDER.invalidates) assert.match(source, new RegExp(`api\\(\\)\\.${domain}\\.list\\.key\\(\\)`), `a chave de ${domain} não vem do contrato`)
  })

  it('o tema também grava sem aviso de sucesso, e o erro passa pela tradução', () => {
    const themeSource = readFileSync(new URL('../../src/providers/theme.tsx', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.match(themeSource, /preferences\.setTheme/)
    assert.match(themeSource, /toast\.error\(translateRemoteError\(cause\)\.message\)/, 'a falha de tema precisa chegar à tela, não ao console')
    assert.doesNotMatch(themeSource, /toast\.success/)
    // `console.error` para falha de GRAVAÇÃO é o defeito que esta bateria persegue: ele promete
    // que guardou e não guardou. O do boot é outra coisa e vive em `main.tsx`.
    assert.doesNotMatch(themeSource, /console\.error/)
  })

  it('recorte e período gravam SEM aviso de sucesso, e isso é decisão', () => {
    // Um aviso a cada mês arrastado é a definição do toast que se aprende a ignorar. O erro, esse
    // aparece: `persist` manda a falha para o mesmo aviso global das outras escritas.
    assert.match(source, /persist\(services\(\)\.preferences\.setScope/)
    assert.match(source, /persist\(services\(\)\.preferences\.setPeriod/)
    assert.match(source, /toast\.error\(translateRemoteError\(cause\)\.message\)/, 'a falha de preferência precisa chegar à tela, não ao console')
    assert.doesNotMatch(source, /toast\.success\([^)]*(recorte|período|periodo)/i)
  })
})

describe('nenhum tratamento de erro no ponto de uso', () => {
  const screens: string[] = []
  const walk = (dir: URL, prefix: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
      else if (e.name.endsWith('.tsx')) screens.push(`${prefix}${e.name}`)
    }
  }
  walk(root, '')

  const withOwnErrorPanel = EDGES.filter((a) => 'ownErrorPanel' in a && a.ownErrorPanel).map((a) => a.screen)

  it('nenhuma rota passa onError, salvo as que têm painel de erro DECLARADO aqui', () => {
    const offenders = screens.filter((t) => /onError/.test(codeOf(t))).filter((t) => !withOwnErrorPanel.some((declared) => t.endsWith(declared)))
    assert.deepEqual(offenders, [], 'a §5 proíbe tratar erro de escrita no ponto de uso; a exceção é a tela com painel de erro próprio, e ela precisa ser declarada na tabela acima')
  })

  it('e a exceção declarada realmente USA o onError — senão ela é uma licença em branco', () => {
    // Uma entrada `ownErrorPanel: true` que sobrevive à remoção do painel abriria a exceção para
    // qualquer coisa que mexesse naquele arquivo depois.
    for (const screen of withOwnErrorPanel) assert.match(codeOf(screen), /onError/, `${screen} está declarada com erro próprio e não passa onError`)
  })

  it('e as rotas conferidas são muitas — o varredor não parou de olhar', () => {
    assert.ok(screens.length > 30, `só ${screens.length} telas varridas`)
  })
})

/**
 * Nenhum hook de ESCRITA reutilizado sobreviveu.
 *
 * `use-declarations.ts` era exatamente isso: duas — depois três — telas gravavam por ele, com
 * pending, erro e sucesso embrulhados, e o preço era uma mensagem genérica para tudo. A §5 o
 * proíbe nominalmente. `src/hooks/` continua existindo para o que não grava.
 */
describe('src/hooks/ não grava', () => {
  it('nenhum hook compartilhado chama replace/save/set de um serviço', () => {
    const dir = new URL('../../src/hooks/', import.meta.url)
    const ofensores = readdirSync(dir).filter((nome) => /services\(\)[\s\S]{0,80}\.(replace|save|set|remove)\(/.test(readFileSync(new URL(nome, dir), 'utf8')))
    assert.deepEqual(ofensores, [], 'hook de escrita reutilizado: a frase do aviso tem de ser do ponto de uso')
  })
})

/**
 * E TODA mutação avisa — a §5 de `data-fetching.md`.
 *
 * Uma escrita silenciosa é indistinguível de uma escrita que não aconteceu: a pessoa clica, a linha
 * não muda visivelmente (um campo de rubrica, uma categoria de lançamento) e ela clica de novo. O
 * erro já tem dono único no `MutationCache` do provider; o SUCESSO é por mutação, porque só o ponto
 * de uso sabe o nome do registro que acabou de mudar — "Rubrica de Saúde salva" e "Plano removido"
 * são a diferença entre confirmar e adivinhar.
 *
 * A contagem estava só na prosa da rule, e prosa não segura número: ela afirmava 21 escritas quando
 * havia 20, e um `useMutation` novo sem toast não teria acusado nada. O piso aqui é para o varredor
 * não emudecer se alguém mudar a forma da chamada.
 *
 * **As três escritas SEM aviso de sucesso não são `useMutation`** e por isso não aparecem aqui:
 * recorte, período e tema gravam por `persist()` no provider de filtros e no de tema, com o erro
 * passando pela mesma tradução. A distinção está trancada no `describe` do provider, acima.
 */
describe('toda mutação avisa', () => {
  it('nenhum useMutation grava em silêncio', async () => {
    const { readdirSync } = await import('node:fs')
    const src = new URL('../../src/', import.meta.url)

    const files: string[] = []
    const walk = (dir: URL, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
        else if (/\.tsx?$/.test(entry.name)) files.push(`${prefix}${entry.name}`)
      }
    }
    walk(src)

    let total = 0
    const silent: string[] = []
    for (const relative of files) {
      const source = readFileSync(new URL(relative, src), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      for (const found of source.matchAll(/useMutation\(\{/g)) {
        total++
        // O corpo da chamada, fechando a chave no MESMO nível: uma janela de N linhas cortaria a
        // mutação longa no meio e acusaria o toast que está logo abaixo do corte.
        let i = found.index + found[0].length - 1
        let depth = 0
        for (; i < source.length; i++) {
          if (source[i] === '{') depth++
          else if (source[i] === '}' && --depth === 0) break
        }
        const body = source.slice(found.index, i)
        if (!body.includes('toast.')) silent.push(`${relative}:${source.slice(0, found.index).split('\n').length}`)
      }
    }

    assert.ok(total >= 20, `só ${total} useMutation encontrados — o varredor parou de olhar`)
    assert.deepEqual(silent, [], 'useMutation sem toast: escrita silenciosa é indistinguível de escrita que não aconteceu, e quem clica clica de novo')
  })
})
