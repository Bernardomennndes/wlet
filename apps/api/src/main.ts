import { serve } from '@hono/node-server'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { createAuth } from '@wlet/auth'
import { createDb } from '@wlet/db'
import { resolveSession } from './shared/auth'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { configRouter } from './routers/config'
import { datasetRouter } from './routers/dataset'
import { overridesRouter } from './routers/overrides'
import { plansRouter } from './routers/plans'
import { preferencesRouter } from './routers/preferences'

/**
 * O servidor do WLET.
 *
 * **Hono e não Express**: ele fala a API de `Request`/`Response` do padrão web, que é a mesma
 * que o `@orpc/server` consome — sem adaptador no meio — e roda igual em Node, Bun ou num
 * runtime de borda. A escolha não prende a hospedagem hoje para desprender depois.
 *
 * **`OpenAPIHandler` e não o handler RPC**: o contrato declara `method` e `path` em cada rota
 * (`GET /dataset`, `PATCH /plans/{id}`), então o que sai é uma API REST de verdade — legível no
 * navegador, testável com curl, e documentável sozinha. É o mesmo desenho do `@blips/api`, onde
 * o contrato descreve HTTP e o cliente é só um consumidor tipado dele.
 */
const url = process.env.DATABASE_URL
if (!url) {
  // Falhar AQUI, no arranque, e não na primeira consulta: um servidor que sobe sem banco
  // responde 500 a tudo e parece defeito de código.
  console.error('[wlet-api] DATABASE_URL não está definida.')
  process.exit(1)
}

const db = createDb(url)

/**
 * O `AUTH_SECRET` é obrigatório e NÃO tem padrão.
 *
 * Um valor de fallback num app que guarda extrato bancário seria a mesma chave de assinatura em
 * toda instalação que esqueceu de configurá-la — e quem soubesse o padrão forjaria sessão em
 * qualquer uma delas. Falhar no arranque é a única resposta honesta.
 */
const secret = process.env.AUTH_SECRET
if (!secret) {
  console.error('[wlet-api] AUTH_SECRET não está definida. Gere uma com `openssl rand -base64 32`.')
  process.exit(1)
}

const origens = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',')
const auth = createAuth(db, { baseURL: process.env.AUTH_URL ?? `http://localhost:${process.env.PORT ?? 8787}`, secret, trustedOrigins: origens })

const router = {
  dataset: datasetRouter(db),
  config: configRouter(db),
  preferences: preferencesRouter(db),
  overrides: overridesRouter(db),
  plans: plansRouter(db),
}

const handler = new OpenAPIHandler(router, {
  // Sem isto, um erro de validação ou de banco sai como 400/500 SEM corpo, e o log fica mudo —
  // foi exatamente o que aconteceu na primeira subida.
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      } catch (cause) {
        // As `issues` do Zod são o que diz QUAL campo divergiu; sem expandi-las, o log
        // mostra `[Object]` e o erro fica indistinguível de qualquer outro.
        const issues = (cause as { cause?: { issues?: unknown[] } })?.cause?.issues
        console.error('[wlet-api] erro no handler:', (cause as Error)?.message, issues ? JSON.stringify(issues.slice(0, 4), null, 2) : '')
        throw cause
      }
    },
  ],
})

/**
 * A especificação sai do CONTRATO, não de um arquivo escrito à mão.
 *
 * É o ganho de o contrato descrever HTTP: a documentação não pode divergir da implementação,
 * porque as duas leem o mesmo objeto. Um `.output()` que mude aparece aqui na hora.
 */
const openapi = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })

const app = new Hono()

/**
 * CORS com origem DECLARADA, nunca `*`.
 *
 * As respostas carregam extrato bancário e as chamadas levam credencial; com `*` o navegador
 * recusaria a credencial de qualquer forma, e afrouxar isso seria abrir a leitura para qualquer
 * página que a pessoa tenha aberto noutra aba.
 */
app.use(
  '*',
  cors({
    origin: origens,
    credentials: true,
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

/**
 * O Better Auth monta as próprias rotas em `/api/auth/*`: cadastro, login, sessão, logout.
 *
 * Elas ficam FORA do contrato oRPC de propósito — autenticação não é um domínio do WLET, é a
 * fronteira que o precede, e o contrato descreve o que o app faz depois de já se saber quem é
 * quem.
 */
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

app.get('/v1/openapi.json', async (c) => c.json(await openapi.generate(router, { info: { title: 'WLET', version: '0.1.0' }, servers: [{ url: '/v1' }] })))

app.use('/v1/*', async (c, next) => {
  /**
   * O `userId` sai do TOKEN, e não de um header que o cliente escolhe.
   *
   * Enquanto era `x-user-id`, qualquer um lia o extrato de qualquer pessoa mudando um cabeçalho
   * — o eixo de isolamento existia no schema e não na porta. Sem sessão válida a requisição para
   * aqui, antes de qualquer handler: um `userId` vazio chegando ao banco devolveria lista vazia
   * em vez de negar, e "vazio" é indistinguível de "não tem nada".
   */
  const userId = await resolveSession(auth, c.req.raw.headers)
  if (!userId) return c.json({ error: 'não autenticado' }, 401)

  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/v1',
    context: { userId },
  })
  if (matched) return response
  await next()
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => console.info(`[wlet-api] ouvindo em http://localhost:${info.port}`))
