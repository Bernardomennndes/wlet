import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * HÁ UMA ORIGEM: o servidor. Este arquivo é o que mantém a frase verdadeira.
 *
 * Havia duas, escolhidas pela presença de `VITE_API_URL`, e a ramificação custava mais do que
 * entregava: todo dado tinha duas respostas possíveis conforme onde fosse lido, o `pnpm ingest`
 * do terminal nunca enxergava o que o navegador tinha guardado, e a mesma conta aberta em dois
 * aparelhos mostrava números diferentes sem nada avisar.
 *
 * A migração está feita — conferido aqui, não suposto. O que não havia era o que impede a
 * segunda origem de voltar, e ela volta de um jeito que parece melhoria: um adapter local "para
 * funcionar offline", uma semente promovida a repositório "para abrir mais rápido". Nenhum dos
 * dois quebra teste nenhum. O sintoma é o de sempre — dois números certos, um em cada tela.
 *
 * Todas as checagens são de FONTE porque é disso que se trata: a pergunta não é o que o app faz
 * com um servidor de pé, é o que ele está LIGADO a consultar.
 */
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const read = (relative: string) =>
  readFileSync(`${repoRoot}${relative}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')

const SERVICES = 'packages/services/src'
const ROOT = 'apps/web/src/lib/services.ts'

/**
 * O que vive em `infrastructure/` sem falar oRPC, e por quê.
 *
 * A exceção é nomeada uma a uma de propósito: uma lista por padrão — "tudo que termina em
 * `-id.adapter.ts`" — aceitaria o próximo adapter local que alguém batizasse assim.
 */
const NAO_E_ARMAZENAMENTO: Record<string, string> = {
  'plans/infrastructure/plan-id.adapter.ts': 'gera id, não guarda nada — é relógio e sorte, não origem de dado',
}

describe('a infraestrutura dos contextos fala oRPC, e só', () => {
  const contexts = readdirSync(`${repoRoot}${SERVICES}`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  it('os cinco contextos e o compartilhado continuam lá', () => {
    // Um `readdirSync` que devolve pouco faria as checagens abaixo passarem sem ter olhado nada.
    assert.ok(contexts.length >= 6, `só ${contexts.length} contextos lidos: ${contexts.join(', ')}`)
  })

  it('nenhum adapter de armazenamento fora do oRPC', () => {
    // O IndexedDB e o `localStorage` que existiam aqui foram embora. Um voltar é a segunda
    // origem voltando — e ela não precisa ser escolhida por ninguém para causar estrago: basta
    // ser montada num contexto e aquele contexto passa a responder outra coisa que os demais.
    const foreign: string[] = []
    for (const context of contexts) {
      let files: string[]
      try {
        files = readdirSync(`${repoRoot}${SERVICES}/${context}/infrastructure`)
      } catch {
        continue
      }
      for (const file of files) {
        const relative = `${context}/infrastructure/${file}`
        if (file.startsWith('orpc') || NAO_E_ARMAZENAMENTO[relative]) continue
        foreign.push(relative)
      }
    }
    assert.deepEqual(foreign, [], 'adapter de infraestrutura que não fala com o servidor')
  })

  it('e o barrel não EXPÕE repositório que não seja oRPC', () => {
    // Exportar já é oferecer: um `makeLocalPlanRepository` no barrel é um convite a montá-lo,
    // e a tela que o montasse não teria como saber que passou a ler de outro lugar.
    const barrel = read(`${SERVICES}/index.ts`)
    const wrong = [...barrel.matchAll(/\bmake([A-Za-z]+?)(Repository|SourceStore|IngestRunner)\b/g)].map((m) => m[0]).filter((name) => !name.startsWith('makeOrpc'))
    assert.deepEqual([...new Set(wrong)], [])
  })
})

describe('o composition root monta uma origem só', () => {
  const source = read(ROOT)
  const build = source.slice(source.indexOf('export function build'))

  it('todo repositório, runner e depósito de arquivos é oRPC', () => {
    const mounted = [...build.matchAll(/\b(repository|runner|sources):\s*([A-Za-z]+)\(/g)]
    assert.ok(mounted.length >= 7, `só ${mounted.length} adapters montados — o padrão da busca quebrou`)
    const wrong = mounted.map((m) => `${m[1]}: ${m[2]}`).filter((pair) => !pair.includes(': makeOrpc'))
    assert.deepEqual(wrong, [], 'adapter não-oRPC montado no composition root')
  })

  it('a semente entra como SEMENTE — nunca como repositório', () => {
    // É a distinção que decide quem ganha. Como `seed`, o bundle só aparece quando o servidor
    // está vazio; como `repository`, ele passaria na FRENTE do servidor, e quem tem
    // `src/generated/` na máquina veria a demonstração no lugar do próprio extrato, sem aviso.
    for (const seed of ['makeBundleSeed', 'makeBundleDeclarations']) {
      const uses = [...build.matchAll(new RegExp(`([a-zA-Z]+):\\s*${seed}\\(`, 'g'))].map((m) => m[1])
      assert.deepEqual(uses, ['seed'], `${seed} montada fora de \`seed\``)
    }
  })

  it('e o servidor é consultado por um cliente ÚNICO', () => {
    // Dois clientes para o mesmo servidor são duas configurações de credencial livres para
    // divergir, e o sintoma — metade do app autenticada e a outra não — só aparece em produção.
    const built: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(`${repoRoot}${dir}`, { withFileTypes: true })) {
        const relative = `${prefix}${entry.name}`
        if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${relative}/`)
        else if (/\.tsx?$/.test(entry.name) && read(relative).includes('createWletClient(')) built.push(relative)
      }
    }
    walk('apps/web/src/', 'apps/web/src/')
    assert.deepEqual(built, ['apps/web/src/lib/api.ts'])
  })
})
