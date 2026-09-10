import { serve } from '@hono/node-server'
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { createDb } from '@wlet/db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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

const router = {
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
        console.error('[wlet-api] erro no handler:', cause)
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
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

app.get('/v1/openapi.json', async (c) => c.json(await openapi.generate(router, { info: { title: 'WLET', version: '0.1.0' }, servers: [{ url: '/v1' }] })))

app.use('/v1/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/v1',
    // O `userId` virá do token quando `@wlet/auth` entrar. Enquanto isso ele é explícito e
    // obrigatório, para nenhum handler nascer sem o eixo de isolamento.
    context: { userId: c.req.header('x-user-id') ?? '' },
  })
  if (matched) return response
  await next()
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => console.info(`[wlet-api] ouvindo em http://localhost:${info.port}`))
