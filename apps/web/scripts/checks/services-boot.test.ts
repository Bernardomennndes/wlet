import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * O barrel de serviços NÃO pode acordar o dataset ao ser importado.
 *
 * A regra do portão de boot (`src/lib/dataset.ts`) diz que nada avaliado antes do carregamento
 * pode ler o dataset. `main.tsx` importa `@wlet/services`, então essa cadeia inteira está sob a
 * regra — e quebrá-la não produz mensagem nenhuma: o erro acontece durante o import, antes de
 * o `catch` do boot existir, e o que se vê é uma PÁGINA EM BRANCO. Aconteceu uma vez, porque o
 * barrel de `preferences` importava `META` de `@/lib/finance`.
 *
 * Este teste roda no Node, onde `setDataset` nunca foi chamado: se algum módulo da cadeia ler o
 * dataset na avaliação, o import estoura aqui em vez de estourar no navegador de alguém.
 */
describe('portão de boot', () => {
  it('importar @wlet/services não lê o dataset', async () => {
    await assert.doesNotReject(() => import('../../src/lib/services.ts'))
  })

  it('e o módulo do portão em si também não', async () => {
    const mod = await import('../../src/lib/dataset.ts')
    assert.equal(mod.hasDataset(), false, 'nada preencheu o portão só por importar')
    // A leitura sem carga LANÇA, e é isso que transforma um erro de ordem de boot em mensagem.
    assert.throws(() => mod.dataset(), /antes do boot/)
    assert.throws(() => mod.declarations(), /antes do boot/)
  })

  it('montar os serviços não lê o dataset', async () => {
    // `build()` monta os cinco adapters. Nenhum deles pode tocar o dataset ao ser criado — só
    // quando um caso de uso for chamado.
    const { createWletClient } = await import('@wlet/api')
    const { build } = await import('../../src/lib/services.ts')
    // O cliente entra EXPLÍCITO porque a propriedade trancada aqui não tem nada a ver com de onde
    // a URL veio, e `import.meta.env` não existe no Node.
    assert.doesNotThrow(() => build(createWletClient({ baseUrl: 'http://servidor.invalido/v1' })))
  })

  it('e sem VITE_API_URL a montagem falha DIZENDO o que falta', async () => {
    // O app não tem mais modo local: a ausência da variável é erro de configuração, não uma
    // escolha. Cair num padrão adiaria o erro até a primeira requisição, onde ele chega como
    // 404 sem explicação nenhuma.
    const { apiUrl } = await import('../../src/lib/api-url.ts')
    assert.throws(() => apiUrl(), /VITE_API_URL/)
  })
})

/**
 * O build NÃO pode depender de `src/generated/`.
 *
 * Aquela pasta é escrita por `pnpm ingest` e não é versionada: um clone novo não a tem, e o app
 * promete que os dados vêm do navegador. Mesmo assim as duas sementes a liam por
 * `import('@/generated/x.json')` — caminho fixo, que o Vite resolve em tempo de BUILD. O
 * resultado é que apagar a pasta derrubava a compilação inteira com nove TS2307, num app cujo
 * conteúdo daquela pasta é só um fallback opcional.
 *
 * `import.meta.glob` resolve o padrão em build também, mas devolve `{}` quando nada casa. A
 * diferença entre os dois é exatamente a diferença entre "opcional" e "obrigatório", e é ela
 * que este teste tranca — a regressão é silenciosa até alguém sem a pasta tentar compilar.
 */
describe('a semente é opcional', () => {
  it('nenhum adapter importa @/generated por caminho fixo', async () => {
    const { readFileSync } = await import('node:fs')
    const files = ['bundle-seed.adapter.ts', 'bundle-declarations.adapter.ts']
    for (const file of files) {
      // Os comentários CITAM a forma proibida para explicá-la; procurar nela acusaria a
      // explicação em vez do código.
      const source = readFileSync(new URL(`../../src/lib/${file}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const fixed = source.match(/import\(\s*['"]@\/generated\/[^'"]+['"]\s*\)/g)
      assert.equal(fixed, null, `${file} voltou a exigir os arquivos gerados em tempo de build: ${fixed?.join(', ')}`)
    }
  })

  it('sem semente, as duas devolvem null em vez de estourar', async () => {
    // Fora do Vite `import.meta.glob` não existe, então este ambiente REPRODUZ a ausência.
    const { makeBundleSeed } = await import('../../src/lib/bundle-seed.adapter.ts')
    const { makeBundleDeclarations } = await import('../../src/lib/bundle-declarations.adapter.ts')
    assert.equal(await makeBundleSeed().read(), null)
    assert.equal(await makeBundleDeclarations().read(), null)
  })
})

/**
 * O id de um plano precisa ser único DENTRO DO MESMO MILISSEGUNDO.
 *
 * `@wlet/domain` já oferecia `planId`, com relógio MAIS sufixo aleatório. A montagem da aplicação
 * ignorava aquela função e escrevia a sua própria — `plan-${Date.now().toString(36)}` — que é só o
 * relógio. Medido: 200 chamadas no mesmo tique davam UM id distinto e 199 colisões.
 *
 * Dois planos com o mesmo id não estouram nada: `updatePlan` edita os dois e `removePlan` apaga os
 * dois. Pela tela é difícil alcançar, porque cada criação espera o servidor — o que este teste
 * tranca é o dia em que algo criar planos em laço (duplicar, colar várias linhas, semear), quando
 * a colisão deixa de ser hipótese.
 */
describe('ids de plano', () => {
  it('duas chamadas no mesmo tique dão ids diferentes', async () => {
    const { makePlanIdGenerator } = await import('@wlet/services')
    const ids = new Set(Array.from({ length: 200 }, () => makePlanIdGenerator().next('plan')))
    assert.equal(ids.size, 200, 'o gerador de produção colide dentro do mesmo milissegundo')
  })

  it('a montagem USA o gerador, em vez de escrever o id à mão', async () => {
    // Sem esta checagem, trocar a fiação de volta por um literal deixaria o teste acima verde:
    // ele mede o adapter, e a produção poderia não estar usando o adapter.
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../../src/lib/services.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.match(source, /ids:\s*makePlanIdGenerator\(\)/, 'a montagem deixou de usar makePlanIdGenerator')
    assert.doesNotMatch(source, /ids:\s*\{/, 'a montagem voltou a inventar o id num literal')
  })
})

/**
 * Com o servidor fora do ar, o boot FALHA — e isso é o estado atual, não uma conclusão.
 *
 * `dataset.load()` engole o erro do repositório e responde pela semente, e o comentário dele já
 * prometeu, por isso, que o app abriria com o servidor inacessível. Não abre: as outras quatro
 * leituras do `Promise.all` de `main.tsx` rejeitam, e a tela de erro do `fail()` é o que aparece.
 *
 * O caminho que isto alcança de verdade é o servidor que AUTENTICA e falha numa leitura — 500,
 * tempo esgotado, 401 em corrida. Com o servidor inteiro fora, `getSession()` rejeita antes e a
 * tela de entrada aparece, o que é deliberado e está escrito em `main.tsx`.
 *
 * O teste tranca a MEDIÇÃO, não a escolha. Há dois desenhos coerentes — boot tudo-ou-nada, ou
 * boot resiliente com aviso visível de que o dado não veio do servidor — e o segundo não é
 * escrevível sem decidir o que `plans` e `overrides` mostram sem semente: cair para vazio diria
 * "você não tem planos" quando a verdade é "o servidor não respondeu". Enquanto a decisão não for
 * tomada, este teste é o que impede a assimetria de voltar a ser lida como resiliência.
 */
describe('boot com o servidor fora do ar', () => {
  // Porta 1 nunca tem ninguém ouvindo, então a recusa de conexão é imediata e não depende de rede.
  const dead = 'http://127.0.0.1:1/v1'

  it('dataset.load() sobrevive, e as outras quatro leituras não', async () => {
    const { createWletClient } = await import('@wlet/api')
    const { build } = await import('../../src/lib/services.ts')
    const { dataset, config, preferences, overrides, plans } = build(createWletClient({ baseUrl: dead }))

    const carregado = await dataset.load()
    assert.notEqual(carregado.origin, 'stored', 'sem servidor não há como o conjunto vir do gravado')

    for (const [nome, ler] of [
      ['config.load', () => config.load()],
      ['preferences.load', () => preferences.load()],
      ['overrides.list', () => overrides.list()],
      ['plans.list', () => plans.list()],
    ] as const) {
      await assert.rejects(
        ler,
        (erro: Error) => erro.name === 'ServerUnreachableError',
        `${nome} deixou de rejeitar — se isso foi de propósito, o desenho do boot mudou e o comentário de dataset.load() precisa mudar com ele`,
      )
    }
  })

  it('e o Promise.all do boot, por consequência, cai na tela de erro', async () => {
    const { createWletClient } = await import('@wlet/api')
    const { build } = await import('../../src/lib/services.ts')
    const { dataset, config, preferences, overrides, plans } = build(createWletClient({ baseUrl: dead }))
    await assert.rejects(() => Promise.all([dataset.load(), config.load(), preferences.load(), overrides.list(), plans.list()]))
  })
})

/**
 * O cliente do app NÃO toca armazenamento de navegador.
 *
 * A sessão é o cookie `httpOnly`, que viaja sozinho. Havia aqui um
 * `token: () => localStorage.getItem('wlet.token')` que nada no projeto escrevia — leitura que só
 * podia devolver `null` — e que roda dentro do `headers()` do link, a CADA requisição. Num
 * navegador que bloqueia armazenamento (Safari privado, "bloquear todos os cookies") o acessador
 * lança `SecurityError`, e o app inteiro pararia de falar com o servidor por causa de um token
 * inexistente.
 *
 * O teste é sobre a FONTE e não sobre comportamento porque o defeito é a presença da leitura: um
 * teste que só chamasse `client()` no Node passaria, já que lá `localStorage` é `undefined` e o
 * caminho nem chega a ser exercitado.
 */
describe('o cliente do app não depende de armazenamento local', () => {
  it('api.ts não lê localStorage nem sessionStorage', async () => {
    const { readFileSync } = await import('node:fs')
    // Os comentários EXPLICAM a leitura que saiu; procurar nela acusaria a explicação.
    const source = readFileSync(new URL('../../src/lib/api.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, 'o cliente do app voltou a depender de armazenamento de navegador — e ele lança em navegador com dados bloqueados')
  })

  it('e o app não passa `token`: quem passa é script e teste', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../../src/lib/api.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(source, /token\s*:/, 'a sessão do app é o cookie httpOnly; um `token` aqui é um segundo caminho de credencial livre para divergir')
  })
})
