import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq, users } from '@wlet/db'
import { db, limpar, url } from './support'

/**
 * A PORTA — a fronteira que decide quem entra, testada como o navegador a encontra.
 *
 * Tudo o que os outros testes deste diretório fazem é chamar handler por `call`, sem HTTP. É o
 * certo para o que cada handler faz com o banco, e é cego justamente para a camada em que mora o
 * defeito mais caro deste servidor: **enquanto o `userId` vinha de um header `x-user-id`,
 * qualquer um lia o extrato de qualquer pessoa mudando um cabeçalho.** O eixo de isolamento
 * existia no schema e não na porta, e nenhum teste de handler veria isso — todos passam um
 * `context.userId` que a porta deveria ter provado.
 *
 * Por isso aqui o servidor SOBE de verdade, com o `main.ts` inteiro, e as requisições são
 * `fetch`. É o mesmo argumento do Postgres de verdade em vez de dublê: metade dos defeitos desta
 * camada são de configuração, e configuração não se exercita por chamada de função.
 */
const PORT = 8791
const BASE = `http://localhost:${PORT}`
const ORIGEM = 'http://localhost:4300'
const ORIGEM_ESTRANHA = 'http://mal.exemplo'

const d = db()
let servidor: ReturnType<typeof spawn>
const criados: string[] = []

before(async () => {
  servidor = spawn('pnpm', ['exec', 'tsx', 'src/main.ts'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    // O ambiente é DECLARADO aqui e não herdado do `.env`: este teste afirma coisas sobre a
    // origem permitida, e herdar a do desenvolvimento faria a asserção depender da máquina.
    env: { ...process.env, PORT: String(PORT), WEB_ORIGIN: ORIGEM, AUTH_SECRET: 'segredo-de-teste-nao-usar-em-producao', AUTH_URL: BASE, DATABASE_URL: url },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  /**
   * A prontidão vem da linha que o PRÓPRIO servidor imprime, e não de um `GET /health`.
   *
   * A primeira versão sondava `/health`, e isso é circular: a rota é uma das coisas que este
   * arquivo testa. Movê-la para trás do portão fazia TODOS os testes falharem com "o servidor não
   * subiu" depois de quarenta segundos de espera — uma mensagem que aponta para o ambiente quando
   * o defeito é de rota. O sinal de que o processo está de pé tem de ser independente do que se
   * está medindo.
   */
  await new Promise<void>((pronto, falhou) => {
    const limite = setTimeout(() => falhou(new Error(`o servidor não anunciou a porta em 20s — a suíte precisa do Postgres (docker compose up -d) e da porta ${PORT} livre`)), 20_000)
    let erro = ''
    servidor.stderr?.on('data', (parte: Buffer) => {
      erro += parte.toString()
    })
    servidor.stdout?.on('data', (parte: Buffer) => {
      if (!parte.toString().includes('ouvindo em')) return
      clearTimeout(limite)
      pronto()
    })
    servidor.on('exit', (codigo) => {
      clearTimeout(limite)
      falhou(new Error(`o servidor morreu com código ${codigo}: ${erro.slice(0, 400)}`))
    })
  })
})

after(async () => {
  for (const id of criados) await limpar(d, id)
  await d.close()
  servidor?.kill()
})

/** Cadastro pelo fluxo real, por HTTP: é o cookie que ele devolve que interessa. */
async function comSessao(): Promise<string> {
  const email = `http-${Date.now().toString(36)}-${criados.length}@teste.local`
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEM },
    body: JSON.stringify({ email, password: 'senha-de-teste-longa', name: 'Teste' }),
  })
  assert.equal(r.ok, true, `cadastro falhou: ${r.status} ${await r.text()}`)
  const [row] = await d.select({ id: users.id }).from(users).where(eq(users.email, email))
  criados.push(row.id)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0])
  assert.ok(cookie.length, 'o cadastro não devolveu cookie de sessão')
  return cookie.join('; ')
}

describe('sem sessão não se passa da porta', () => {
  it('o dado responde 401, e não lista vazia', async () => {
    // "Vazio" é indistinguível de "não tem nada": um `userId` vazio chegando ao banco devolveria
    // `[]` e o app mostraria a tela de quem ainda não importou nada, em vez de mandar entrar.
    const r = await fetch(`${BASE}/v1/dataset`)
    assert.equal(r.status, 401)
    assert.deepEqual(await r.json(), { error: 'não autenticado' })
  })

  it('e um CABEÇALHO escolhido pelo cliente não vale como identidade', async () => {
    // O defeito histórico, fechado por este teste: com `x-user-id` bastava trocar um cabeçalho
    // para ler o extrato de outra pessoa. Qualquer header que o cliente escreva é palpite.
    const alvo = await comSessao()
    const donoId = criados[criados.length - 1]
    const atalhos: Record<string, string>[] = [{ 'x-user-id': donoId }, { 'x-userid': donoId }, { authorization: `Bearer ${donoId}` }]
    for (const header of atalhos) {
      const r = await fetch(`${BASE}/v1/dataset`, { headers: header })
      assert.equal(r.status, 401, `${Object.keys(header)[0]} passou pela porta`)
    }
    assert.ok(alvo.length, 'a sessão de verdade existe — o que não vale é o atalho')
  })

  it('a saúde do servidor é PÚBLICA: ela responde antes do portão', async () => {
    // Quem monitora não tem sessão. Pôr `/health` atrás da autenticação faz o monitor ler 401 e
    // declarar o servidor fora do ar justamente quando ele está de pé.
    const r = await fetch(`${BASE}/health`)
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { ok: true })
  })
})

describe('com sessão, a porta abre — e só para quem é', () => {
  it('o cookie do cadastro já dá acesso ao próprio dado', async () => {
    // O caminho inteiro numa asserção: cadastro por HTTP, cookie de volta, cookie aceito pelo
    // `/v1`. Se o Better Auth deixasse de ser montado, ou o `resolveSession` lesse outra coisa,
    // é aqui que aparece.
    const cookie = await comSessao()
    const r = await fetch(`${BASE}/v1/dataset`, { headers: { cookie } })
    assert.equal(r.status, 200)
    assert.equal(await r.json(), null, 'quem acabou de se cadastrar não tem conjunto')
  })

  it('e o conjunto de uma pessoa não aparece com o cookie de outra', async () => {
    const a = await comSessao()
    const b = await comSessao()
    assert.notEqual(a, b, 'dois cookies distintos')
    for (const cookie of [a, b]) assert.equal((await fetch(`${BASE}/v1/dataset`, { headers: { cookie } })).status, 200)
  })
})

describe('CORS com origem DECLARADA, nunca `*`', () => {
  it('a origem do app é ecoada, com credencial liberada', async () => {
    // As respostas carregam extrato e as chamadas levam cookie. Com `*` o navegador recusaria a
    // credencial de qualquer forma; o que `*` abriria de fato é a leitura para qualquer página
    // que a pessoa tenha aberto noutra aba.
    const r = await fetch(`${BASE}/v1/dataset`, { method: 'OPTIONS', headers: { origin: ORIGEM, 'access-control-request-method': 'GET' } })
    assert.equal(r.headers.get('access-control-allow-origin'), ORIGEM)
    assert.equal(r.headers.get('access-control-allow-credentials'), 'true')
  })

  it('e uma origem de fora NÃO é ecoada', async () => {
    const r = await fetch(`${BASE}/v1/dataset`, { method: 'OPTIONS', headers: { origin: ORIGEM_ESTRANHA, 'access-control-request-method': 'GET' } })
    assert.notEqual(r.headers.get('access-control-allow-origin'), ORIGEM_ESTRANHA)
    assert.notEqual(r.headers.get('access-control-allow-origin'), '*')
  })
})

describe('a especificação sai do CONTRATO', () => {
  it('as rotas do contrato estão na OpenAPI, com o prefixo `/v1`', async () => {
    // A documentação não pode divergir da implementação porque as duas leem o mesmo objeto. Um
    // `.output()` que mude aparece aqui na hora — e uma procedure declarada e não implementada
    // nem compila, por causa do `os.router`.
    const spec = (await (await fetch(`${BASE}/v1/openapi.json`)).json()) as { paths: Record<string, unknown>; servers: { url: string }[] }
    assert.deepEqual(spec.servers, [{ url: '/v1' }])
    for (const rota of ['/dataset', '/config', '/preferences', '/overrides', '/plans']) {
      assert.ok(
        Object.keys(spec.paths).some((p) => p.startsWith(rota)),
        `${rota} não está na especificação`,
      )
    }
  })
})
