import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWletClient } from '@wlet/api'

/**
 * As vinte linhas que decidem se o app tem sessão — e se ele acredita no que o servidor diz.
 *
 * `packages/api/src/client.ts` embrulha o `fetch` por dois motivos, e os dois falham do jeito mais
 * silencioso que existe:
 *
 * 1. **`credentials: 'include'`.** A sessão é um cookie `httpOnly`, e cross-origin o navegador só o
 *    envia se a requisição PEDIR. Sem esta linha o cookie existe, o servidor exige sessão, e toda
 *    chamada volta 401 — sem nada no console dizendo que faltou credencial. O app inteiro parece
 *    deslogado e o login parece quebrado.
 * 2. **`ResponseValidationPlugin`.** Sem ele, um servidor que mude um campo devolve algo que o
 *    TypeScript JURA ser do tipo certo, e a quebra acontece três telas adiante, longe da causa.
 *
 * Ao contrário de `api-url.ts`, isto se testa por COMPORTAMENTO: o `fetch` é injetável, e é por ele
 * que se vê o que a requisição levou e o que a resposta teve de atravessar.
 */
const resposta = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** As preferências servem de cobaia: o contrato delas exige os três campos, nulos inclusive. */
const PREFERENCIAS = { scope: null, period: null, theme: null }

/**
 * O que o `fetch` recebe — e a forma importa, porque ela me corrigiu duas asserções.
 *
 * O `OpenAPILink` monta um `Request` COMPLETO (método, cabeçalhos, corpo) e passa o `init` só com o
 * que o embrulho acrescenta: `{ redirect: 'manual', credentials: 'include' }`. Então método e
 * `Authorization` se leem no REQUEST, e a credencial efetiva no INIT — que é o segundo argumento e
 * vence o do request (`same-origin`, o padrão). Eu havia escrito as duas no lugar errado.
 */
function espiao(body: unknown = PREFERENCIAS) {
  const calls: { request: Request; init: RequestInit }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ request: input as Request, init: init ?? {} })
    return resposta(body)
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

describe('toda requisição leva a credencial', () => {
  it('o `fetch` recebe `credentials: include`', async () => {
    // A asserção é sobre o que CHEGA ao `fetch`, e não sobre o que o módulo escreve: é o init
    // efetivo que o navegador lê, e um embrulho que perdesse a opção passaria num teste de fonte.
    const { calls, fetch } = espiao()
    await createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch }).preferences.get()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].init.credentials, 'include')
  })

  it('e o embrulho não apaga o que o link já tinha posto no `init`', async () => {
    // O embrulho é `{ ...init, credentials }`. Escrito como `{ credentials }` ele descartaria o
    // `redirect: 'manual'` que o `OpenAPILink` põe — e um 3xx passaria a ser seguido em silêncio,
    // trocando um erro de rota por uma resposta de outro lugar.
    const { calls, fetch } = espiao()
    await createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch }).preferences.set({ theme: 'dark' })
    assert.equal(calls[0].init.credentials, 'include')
    assert.equal(calls[0].init.redirect, 'manual', 'o que o link pôs no init sobreviveu')
    assert.equal(calls[0].request.method, 'PATCH', 'a escrita continua sendo uma escrita')
  })
})

describe('o token é para quem NÃO tem navegador', () => {
  it('sem token, nenhum cabeçalho de autorização', async () => {
    // O app não usa: a sessão dele é o cookie. Mandar `Authorization: Bearer null` seria pior que
    // não mandar nada — o servidor tem de recusar um token inválido.
    const { calls, fetch } = espiao()
    await createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch }).preferences.get()
    assert.equal(calls[0].request.headers.get('authorization'), null)
  })

  it('com token, ele é lido A CADA chamada — não capturado uma vez', async () => {
    // O token expira e é renovado por fora. Capturado na montagem, o cliente seguiria mandando o
    // velho até alguém recarregar a página, e a sessão pareceria expirar sozinha.
    const { calls, fetch } = espiao()
    let atual = 'primeiro'
    const client = createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch, token: () => atual })
    await client.preferences.get()
    atual = 'segundo'
    await client.preferences.get()
    assert.deepEqual(
      calls.map((call) => call.request.headers.get('authorization')),
      ['Bearer primeiro', 'Bearer segundo'],
    )
  })
})

describe('a resposta é conferida na FRONTEIRA', () => {
  it('resposta fora do contrato é recusada ali, e não três telas adiante', async () => {
    // O incidente que este plugin pega: o servidor devolve um orçamento sem `monthlyLimit`, o
    // TypeScript jura que o campo existe, e a tela quebra ao formatá-lo. Com o plugin, a
    // divergência estoura na chamada.
    const { fetch } = espiao({ scope: 'PJ' })
    await assert.rejects(() => createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch }).preferences.get(), 'faltando `period` e `theme`, a chamada tem de falhar')
  })

  it('e a resposta COMPLETA atravessa', async () => {
    // A guarda não pode ser um portão fechado: o contrato aceita os três nulos, que é o estado de
    // quem nunca escolheu nada.
    const { fetch } = espiao()
    assert.deepEqual(await createWletClient({ baseUrl: 'http://servidor.teste/v1', fetch }).preferences.get(), PREFERENCIAS)
  })
})
