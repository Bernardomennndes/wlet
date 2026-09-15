import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { body, read, repoRoot, stripComments } from './support/source-fields'

/**
 * NADA de dado no navegador — e o acessador que LANÇA.
 *
 * O app guardava tudo no navegador (IndexedDB, `localStorage`, pipeline em Web Worker) e isso
 * acabou: há uma origem, o servidor. Um `localStorage` que volte não é só regressão de arquitetura
 * — é dado fora do servidor, que o `pnpm ingest` do terminal não enxerga e que faz dois aparelhos
 * mostrarem números diferentes sem nada avisar.
 *
 * E há um motivo mais imediato, medido neste repositório. `api.ts` tinha
 * `token: () => localStorage.getItem('wlet.token')` dentro do `headers()` do link — ou seja, **a
 * cada requisição**. Nada escrevia `wlet.token`, então a leitura só podia devolver `null`; mas num
 * navegador que bloqueia armazenamento o próprio ACESSO lança: `SecurityError: The operation is
 * insecure.`. O app inteiro pararia de falar com o servidor por causa de um token que nunca
 * existiu. Por isso a regra aqui não é "não guarde nada": é que tocar em armazenamento do
 * navegador exige guarda, e no caminho da requisição não se toca de jeito nenhum.
 */
const ROOTS = ['apps/web/src/', 'packages/']

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated') continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(relative)
    }
  }
  for (const root of ROOTS) walk(root, root)
  return out
}

/**
 * O acesso a cookie que NÃO está embrulhado, e por quê.
 *
 * O `sidebar.tsx` vem do registry e ESCREVE o cookie a cada alternância da barra. A leitura
 * correspondente, que é nossa (`app-shell.tsx`), já está protegida — quem escreveu aquela guarda
 * considerou o risco real. A escrita ficou como veio. Fica declarada em vez de anistiada em
 * silêncio: é código de terceiro na nossa árvore, e mexer nele é decisão de quem o mantém.
 */
const UNGUARDED: Record<string, string> = {
  'packages/ui/src/components/sidebar.tsx': 'escrita do `sidebar_state`, como veio do registry — a leitura equivalente, nossa, já tem `try`',
}

const STORAGE = /\b(localStorage|sessionStorage|indexedDB)\b/

describe('o dado não volta para o navegador', () => {
  const files = sourceFiles()

  it('o varredor está olhando para o app e os pacotes', () => {
    assert.ok(files.length >= 200, `só ${files.length} arquivos varridos`)
  })

  it('nenhum uso de `localStorage`, `sessionStorage` ou `indexedDB`', () => {
    // Zero, sem exceção: qualquer um deles é dado vivendo fora do servidor. Os comentários que os
    // citam para explicar por que NÃO se usa são removidos antes da busca — é a diferença entre
    // contar história e abrir uma porta.
    const found = files.filter((file) => STORAGE.test(stripComments(read(file))))
    assert.deepEqual(found, [], 'armazenamento do navegador de volta no código')
  })
})

describe('tocar em cookie exige guarda', () => {
  /** Há um `try` antes e um `catch` depois, na vizinhança do acesso. */
  const guarded = (source: string, at: number) => {
    const before = source.slice(Math.max(0, at - 400), at)
    const after = source.slice(at, at + 400)
    return /\btry\s*\{/.test(before) && /\bcatch\s*(\(|\{)/.test(after)
  }

  it('todo `document.cookie` está embrulhado, ou declarado', () => {
    // O acessador lança quando o navegador bloqueia armazenamento — num iframe sem
    // `allow-same-origin`, ler cookie é `SecurityError`. Sem guarda, a exceção sobe pela árvore de
    // render e derruba a tela inteira por causa de uma preferência de barra lateral.
    const naked: string[] = []
    for (const file of sourceFiles()) {
      const source = stripComments(read(file))
      for (const match of source.matchAll(/document\.cookie/g)) {
        if (guarded(source, match.index) || UNGUARDED[file]) continue
        naked.push(`${file}: document.cookie sem try/catch`)
      }
    }
    assert.deepEqual(naked, [])
  })

  it('e a exceção declarada continua sendo exceção', () => {
    // Se o arquivo ganhar a guarda, ele sai da lista — e este teste obriga a isso, para a anistia
    // não virar sedimento.
    for (const [file, motivo] of Object.entries(UNGUARDED)) {
      const source = stripComments(read(file))
      const uses = [...source.matchAll(/document\.cookie/g)]
      assert.ok(uses.length > 0, `${file} não toca mais em cookie (${motivo}) — tire-o da lista`)
      assert.ok(
        uses.some((match) => !guarded(source, match.index)),
        `${file} já está todo embrulhado — tire-o da lista`,
      )
    }
  })
})

describe('o caminho da REQUISIÇÃO não toca em armazenamento', () => {
  const API = 'apps/web/src/lib/api.ts'

  it('o cliente é montado sem `token`', () => {
    // O `token` é um callback executado a cada requisição. Ele existe para quem NÃO tem navegador
    // — teste e script passam o próprio, pelo plugin `bearer`. No app a sessão é o cookie
    // `httpOnly`, que viaja sozinho; um `token` aqui só pode ler de algum lugar, e ler a cada
    // requisição é exatamente o defeito que já aconteceu.
    const source = stripComments(read(API))
    const at = source.indexOf('createWletClient(')
    assert.notEqual(at, -1, 'a montagem do cliente mudou de forma')
    // O objeto sai por contagem de CHAVES: `[^)]*` para no primeiro `)`, e `token: () => …` tem um
    // logo ali — a primeira versão deste teste passava por cima de um `token` que estava presente.
    const options = body(source, at)
    assert.doesNotMatch(options, /\btoken\b/, 'o cliente do app voltou a carregar um `token` por requisição')
  })

  it('e nada é montado na AVALIAÇÃO do módulo', () => {
    // `client()` e `api()` são funções porque `apiUrl()` LANÇA quando a variável falta: montar na
    // avaliação transformaria um erro de configuração numa página em branco, já que o import
    // acontece antes de qualquer `catch` existir.
    const source = stripComments(read(API))
    assert.doesNotMatch(source, /^export const \w+ = createWletClient/m)
    assert.match(source, /export function client\(\)/)
    assert.match(source, /export function api\(\)/)
  })
})
