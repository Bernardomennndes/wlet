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
    await assert.doesNotReject(() => import('../../src/services.ts'))
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
    const { build } = await import('../../src/services.ts')
    // O cliente entra EXPLÍCITO porque a propriedade trancada aqui não tem nada a ver com de onde
    // a URL veio, e `import.meta.env` não existe no Node.
    assert.doesNotThrow(() => build(createWletClient({ baseUrl: 'http://servidor.invalido/v1' })))
  })

  it('e sem VITE_API_URL a montagem falha DIZENDO o que falta', async () => {
    // O app não tem mais modo local: a ausência da variável é erro de configuração, não uma
    // escolha. Cair num padrão adiaria o erro até a primeira requisição, onde ele chega como
    // 404 sem explicação nenhuma.
    const { apiUrl } = await import('../../src/api-url.ts')
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
    const arquivos = ['bundle-seed.adapter.ts', 'bundle-declarations.adapter.ts']
    for (const arquivo of arquivos) {
      // Os comentários CITAM a forma proibida para explicá-la; procurar nela acusaria a
      // explicação em vez do código.
      const fonte = readFileSync(new URL(`../../src/${arquivo}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      const fixo = fonte.match(/import\(\s*['"]@\/generated\/[^'"]+['"]\s*\)/g)
      assert.equal(fixo, null, `${arquivo} voltou a exigir os arquivos gerados em tempo de build: ${fixo?.join(', ')}`)
    }
  })

  it('sem semente, as duas devolvem null em vez de estourar', async () => {
    // Fora do Vite `import.meta.glob` não existe, então este ambiente REPRODUZ a ausência.
    const { makeBundleSeed } = await import('../../src/bundle-seed.adapter.ts')
    const { makeBundleDeclarations } = await import('../../src/bundle-declarations.adapter.ts')
    assert.equal(await makeBundleSeed().read(), null)
    assert.equal(await makeBundleDeclarations().read(), null)
  })
})
