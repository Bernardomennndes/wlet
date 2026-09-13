import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  CorruptedDataError,
  DomainError,
  ForbiddenError,
  InvalidRequestError,
  ServerError,
  ServerUnreachableError,
  SessionExpiredError,
  translateRemoteError,
} from '@wlet/services/shared/domain/errors'

/**
 * O que o servidor lançou VIRA português antes de chegar à tela.
 *
 * Sem tradução, o que a pessoa lê é `TypeError: Failed to fetch` — uma frase que não diz nem que
 * houve rede envolvida — ou um `ORPCError` com o status cru. Pior: "a rede caiu" e "a sua sessão
 * acabou" chegariam indistinguíveis, e as duas pedem respostas opostas (esperar, ou entrar de
 * novo). Este arquivo tranca cada ramo da tradução.
 */
const orpcError = (status: number, message = '') => Object.assign(new Error(message), { status, code: 'X', defined: false })

describe('tradução de erro remoto', () => {
  it('sem status é requisição que não chegou', () => {
    // `TypeError: Failed to fetch` é o que o navegador lança para rede caída, servidor desligado
    // e CORS recusando por igual — não há como distinguir os três daqui, e a mensagem não tenta.
    assert.ok(translateRemoteError(new TypeError('Failed to fetch')) instanceof ServerUnreachableError)
    assert.ok(translateRemoteError('qualquer coisa') instanceof ServerUnreachableError)
    assert.ok(translateRemoteError(null) instanceof ServerUnreachableError)
  })

  it('401 é sessão expirada, e nada mais', () => {
    const error = translateRemoteError(orpcError(401))
    assert.ok(error instanceof SessionExpiredError)
    assert.match(error.message, /Entre de novo/)
  })

  it('403 é acesso negado', () => {
    assert.ok(translateRemoteError(orpcError(403)) instanceof ForbiddenError)
  })

  it('400 e 422 carregam a mensagem do servidor', () => {
    // A mensagem nomeia o CAMPO recusado. Engoli-la manda a pessoa procurar o erro em vinte
    // lugares, que é o oposto do que uma validação serve para fazer.
    for (const status of [400, 422]) {
      const error = translateRemoteError(orpcError(status, 'month: formato inválido'))
      assert.ok(error instanceof InvalidRequestError, String(status))
      assert.match(error.message, /month: formato inválido/)
    }
    assert.match(translateRemoteError(orpcError(400)).message, /recusou os dados/)
  })

  it('5xx é falha do servidor; outro status vira falha com o número dentro', () => {
    assert.ok(translateRemoteError(orpcError(500)) instanceof ServerError)
    assert.ok(translateRemoteError(orpcError(503)) instanceof ServerError)
    assert.match(translateRemoteError(orpcError(418)).message, /418/)
  })

  it('erro de DOMÍNIO passa intacto', () => {
    // Um `UnknownCategoryError` levantado pelo caso de uso já é a mensagem certa. Reembrulhá-lo
    // como "o servidor falhou" apagaria a única informação útil que existia.
    const mine = new CorruptedDataError()
    assert.equal(translateRemoteError(mine), mine)
    const own = new DomainError('categoria inexistente')
    assert.equal(translateRemoteError(own), own)
  })
})

/**
 * NENHUMA chamada ao cliente pode escapar do embrulho.
 *
 * Uma chamada solta compila, passa no caminho feliz e só se revela no dia em que falha — que é
 * exatamente o dia em que a mensagem importa. Nada no compilador nem no lint pega isso, então
 * pega aqui: cada `client.x.y(` de um adapter remoto tem de ter um `remote(` correspondente.
 */
describe('todo adapter remoto passa por remote()', () => {
  it('a contagem de chamadas casa com a de embrulhos', () => {
    const root = new URL('../../../../packages/services/src/', import.meta.url)
    const contexts = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'shared')
      .map((e) => e.name)
    let checked = 0
    for (const context of contexts) {
      // O NOME do arquivo não deriva do contexto — `overrides/` guarda `orpc-override.adapter.ts`
      // e `plans/` guarda `orpc-plan.adapter.ts`. Montar o caminho por convenção daria "não
      // encontrado" em dois contextos, e um teste que não acha o arquivo passa por omissão.
      const dir = new URL(`${context}/infrastructure/`, root)
      const name = readdirSync(dir).find((f) => f.startsWith('orpc-') && f.endsWith('.adapter.ts'))
      assert.ok(name, `${context}: nenhum adapter remoto`)
      const source = readFileSync(new URL(name, dir), 'utf8')
      // Os comentários CITAM as duas formas para explicá-las; contá-los acusaria a explicação.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const calls = code.match(/client\.[A-Za-z]+\.[A-Za-z]+\(/g) ?? []
      const wrappers = code.match(/remote\(/g) ?? []
      assert.equal(wrappers.length, calls.length, `${context}: ${calls.length} chamadas ao cliente para ${wrappers.length} remote()`)
      assert.ok(calls.length > 0, `${context}: nenhuma chamada encontrada — o padrão do arquivo mudou e este teste parou de olhar`)
      checked++
    }
    assert.equal(checked, 5, 'os cinco contextos têm adapter remoto')
  })
})

/**
 * E a TERCEIRA porta de saída: o `queryFn` que o contrato fabrica.
 *
 * `api().x.y.queryOptions()` traz chave E função de busca prontas, e é assim que a §4 de
 * `data-fetching.md` descreve a leitura. Só que aquela função chama o cliente DIRETO — ela não passa
 * por `remote()`, porque `remote()` é do adapter e ela nasce na ponte do oRPC. O `describe` acima
 * conta `client.x.y(` no código-fonte dos adapters e não vê isso: a chamada não existe como texto
 * neste repositório, ela é fabricada dentro do pacote.
 *
 * **Medido contra uma porta morta**, lendo a mesma procedure pelos dois caminhos:
 *
 * | caminho | o que chega à tela |
 * |---|---|
 * | `services().plans.list()` | `ServerUnreachableError` — "Não foi possível falar com o servidor. Verifique a conexão" |
 * | `queryOptions().queryFn()` | `TypeError` — "fetch failed" |
 *
 * Então a leitura deste app é sempre `queryKey: api().x.y.key()` mais `queryFn` que passa pelo
 * SERVIÇO. A chave continua vindo do contrato, que é o que a §4 realmente protege (duas telas com o
 * mesmo input compartilham cache); o que não vem de lá é a função, e não vem de propósito.
 *
 * `key()` fica liberado justamente porque é só a chave — ele não faz requisição nenhuma.
 */
describe('nenhuma leitura usa o queryFn do contrato', () => {
  it('o app pede `key()`, nunca `queryOptions()`', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const root = fileURLToPath(new URL('../../src/', import.meta.url))

    const files: string[] = []
    const walk = (dir: string, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`)
        else if (/\.tsx?$/.test(entry.name)) files.push(`${prefix}${entry.name}`)
      }
    }
    walk(root)

    const uses: string[] = []
    for (const relative of files) {
      // Os comentários CITAM `queryOptions()` para explicar por que ele não é usado — procurar na
      // explicação acusaria a própria documentação da decisão.
      const source = readFileSync(`${root}${relative}`, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      for (const found of source.matchAll(/\bqueryOptions\s*\(/g)) uses.push(`${relative}:${source.slice(0, found.index).split('\n').length}`)
    }

    assert.deepEqual(
      uses,
      [],
      'leitura pelo `queryOptions()` do contrato: o `queryFn` dele chama o cliente fora de `remote()`, e a tela recebe "fetch failed" no lugar da mensagem traduzida. Use `queryKey: api().x.y.key()` com `queryFn` que passe pelo serviço',
    )
  })
})
