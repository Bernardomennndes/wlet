import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * Identificador é en-US; prosa é pt-BR. A §1 de `language-conventions.md`.
 *
 * A regra é fácil de enunciar e fácil de furar, porque as duas línguas convivem no MESMO arquivo:
 * o comentário acima da linha está certo em português, e o nome da variável logo abaixo não. Nada
 * pegava isso — `tsc` não tem opinião sobre idioma e o Biome também não.
 *
 * **Furei eu mesmo, escrevendo os sensores das outras regras**: `varrer`, `arquivos`, `fonte`,
 * `achado`, `usos`, `permitidos`, `soltos`, `semBorda`, `cobranca`, `morto`. Os sensores anteriores
 * a isso usavam `pathsOf`, `matchCount`, `declaredCounts`, `unmatched` — o estilo da casa sempre foi
 * en-US, e a deriva entrou junto com quem estava conferindo as regras. É o argumento mais forte a
 * favor deste arquivo: quem viola não percebe.
 *
 * **A lista é de palavras que NÃO são inglês.** `item`, `total` e `data` ficam de fora de propósito:
 * são inglês também, e acusá-las seria acusar código certo — o modo mais rápido de um sensor ser
 * desligado. A lista não precisa ser exaustiva; ela precisa não ter falso positivo.
 */
const PORTUGUESE = new Set([
  'achado',
  'achados',
  'alvo',
  'alvos',
  'ambiguo',
  'ambiguos',
  'antes',
  'arquivo',
  'arquivos',
  'altura',
  'bloco',
  'blocos',
  'busca',
  'campo',
  'campos',
  'chave',
  'chaves',
  'cheio',
  'cobranca',
  'cobrancas',
  'conferido',
  'conferidos',
  'contagem',
  'corpo',
  'declarada',
  'declaradas',
  'dentro',
  'entrada',
  'entradas',
  'enviando',
  'erro',
  'erros',
  'esperado',
  'fonte',
  'fontes',
  'janela',
  'largura',
  'linha',
  'linhas',
  'lista',
  'listas',
  'marca',
  'mensagem',
  'modo',
  'morto',
  'mudas',
  'nome',
  'nomes',
  'ordem',
  'pasta',
  'pastas',
  'permitido',
  'permitidos',
  'prefixo',
  'primeira',
  'profundidade',
  'relativo',
  'relativos',
  'resultado',
  'rota',
  'rotas',
  'rotulo',
  'saida',
  'segunda',
  'selo',
  'semborda',
  'solto',
  'soltos',
  'tabela',
  'tamanho',
  'texto',
  'titulo',
  'uso',
  'usos',
  'valor',
  'valores',
  'varrer',
  'vazio',
])

/**
 * O que já estava aqui antes desta checagem, por arquivo — e é ISSO que a lista trava.
 *
 * Não é anistia por preguiça: a §6 da rule é explícita em que rename em massa de identificador
 * exige pedido do dono do projeto, e ela separa três níveis de custo (função exportada, tipo e
 * constante, propriedade). Estes são variáveis locais, o nível que a rule nem chega a listar.
 *
 * A lista existe para a população não CRESCER. Um arquivo novo com nome em português quebra o
 * teste; um arquivo daqui que se limpe pode sair da lista, e o teste abaixo obriga a isso — uma
 * entrada que não tem mais violação é acusada, para a lista não virar sedimento.
 */
const PRE_EXISTING: Record<string, string[]> = {
  'apps/api/src/routers/dataset.ts': ['arquivos', 'resultado'],
  'apps/api/src/routers/preferences.ts': ['vazio'],
  'apps/api/tests/auth.test.ts': ['linhas'],
  'apps/api/tests/routers.test.ts': ['corpo', 'dentro', 'entrada'],
  'apps/api/tests/workspace-root.test.ts': ['saida'],
  'apps/web/scripts/checks/backup.test.ts': ['ordem'],
  'apps/web/scripts/checks/dataset-service.test.ts': ['arquivo'],
  'apps/web/scripts/checks/money-mask.test.ts': ['esperado', 'texto', 'valor'],
  'apps/web/scripts/checks/plans.test.ts': ['lista', 'solto'],
  'apps/web/src/routes/rubricas/-components/rubricas-form.tsx': ['nome'],
  'packages/services/src/overrides/infrastructure/orpc-override.adapter.ts': ['antes', 'chaves'],
}

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

/**
 * Os nomes de segmento de rota, que a §5 LIBERA — "porque é URL".
 *
 * `App.tsx` batiza cada rota preguiçosa com o PascalCase da pasta dela: `Cobrancas` para
 * `routes/cobrancas/`, `Transacoes` para `routes/transacoes/`. A URL é produto e vai em pt-BR (§3),
 * então o componente que a carrega segue-a — e é a correspondência 1:1 entre pasta, URL e nome que
 * torna a árvore legível.
 *
 * Lido do DISCO e não de uma lista: uma rota nova entra sozinha, e uma que saia deixa de dar
 * licença ao nome que ficou para trás.
 */
function routeSegmentNames(): Set<string> {
  const pascal = (segment: string) => segment.replace(/(^|-)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())
  return new Set(
    readdirSync(`${repoRoot}apps/web/src/routes/`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('-'))
      .map((entry) => pascal(entry.name).toLowerCase()),
  )
}

/** Sem comentário, sem string e sem template: os três são pt-BR por regra. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
}

/** Só DECLARAÇÃO: é o nome que alguém escolheu, e o único que se pode cobrar. */
function declaredNames(source: string): string[] {
  return [...codeOnly(source).matchAll(/\b(?:const|let|var|function|class|interface|type)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (/\.tsx?$/.test(entry.name)) out.push(relative)
    }
  }
  walk('apps/', 'apps/')
  walk('packages/', 'packages/')
  return out
}

describe('identificador em en-US', () => {
  const found = new Map<string, string[]>()
  for (const relative of sourceFiles()) {
    const routeNames = routeSegmentNames()
    const bad = [...new Set(declaredNames(readFileSync(`${repoRoot}${relative}`, 'utf8')).filter((name) => PORTUGUESE.has(name.toLowerCase()) && !routeNames.has(name.toLowerCase())))].sort()
    if (bad.length) found.set(relative, bad)
  }

  it('há arquivo suficiente sendo lido — o varredor não parou de olhar', () => {
    assert.ok(sourceFiles().length >= 200, `só ${sourceFiles().length} arquivos varridos`)
  })

  it('nenhum nome novo em português', () => {
    const novel: string[] = []
    for (const [relative, names] of found) {
      const allowed = PRE_EXISTING[relative] ?? []
      for (const name of names) if (!allowed.includes(name)) novel.push(`${relative}: ${name}`)
    }
    assert.deepEqual(novel, [], 'identificador em pt-BR (§1 de language-conventions.md): o comentário fica em português, o nome não')
  })

  it('e a lista de pré-existentes não virou sedimento', () => {
    const stale: string[] = []
    for (const [relative, names] of Object.entries(PRE_EXISTING)) {
      const actual = found.get(relative) ?? []
      for (const name of names) if (!actual.includes(name)) stale.push(`${relative}: ${name}`)
    }
    assert.deepEqual(stale, [], 'a lista de pré-existentes cita nome que já não existe — tire a entrada, senão ela passa a dar licença a um arquivo que não precisa mais dela')
  })
})
