import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apiOrigin, apiUrl } from '@/lib/api-url'

/**
 * COM QUE SERVIDOR o app fala — e por que o `/v1` some numa ponta e não na outra.
 *
 * O canal de dados mora em `…/v1`; o Better Auth mora na RAIZ da mesma origem (`/api/auth/*`).
 * Havia duas leituras de `VITE_API_URL`, cada uma com a sua regra de tirar o `/v1`, e o módulo
 * registra o sintoma que elas produziriam: **login que funciona e dado que volta 401, ou o
 * contrário**. As duas metades do app falando com endereços diferentes, cada uma parecendo certa
 * sozinha.
 *
 * **METADE DESTE MÓDULO NÃO É TESTÁVEL POR COMPORTAMENTO, e a razão fica escrita aqui em vez de
 * virar uma lacuna sem nome.** `import.meta.env` é por MÓDULO: no Vite ele é substituído na
 * compilação, e em Node cada módulo tem o seu `import.meta` próprio. Semear o ambiente daqui não
 * alcança o `import.meta` de `api-url.ts` — medido, não suposto: um módulo que escreve e outro
 * que lê devolvem `undefined`. Então, sob o runner, este módulo está permanentemente no estado
 * "sem ambiente", e só o caminho que LANÇA se exercita de verdade.
 *
 * O corte do `/v1` — justamente a parte cujo defeito o módulo descreve — fica num teste de FONTE,
 * pela mesma razão que `format.test.ts` usa um: a alternativa é não ter teste nenhum. **Bastaria
 * `apiOrigin` aceitar a URL por parâmetro (ou exportar o recorte como função pura) para as cinco
 * URLs abaixo virarem teste de comportamento** — é mudança no módulo, e ela é de quem é dono dele.
 */
describe('o endereço do servidor', () => {
  it('a ausência LANÇA, e não cai num padrão', () => {
    // Não tem padrão de propósito. Enquanto os dados também podiam ficar no navegador, a ausência
    // era uma ESCOLHA — "rode tudo local". Agora não é: sem servidor não há conta, sessão nem
    // dado, e um endereço adivinhado só adiaria o erro até a primeira requisição, onde ele chega
    // como 404 sem explicação.
    assert.throws(apiUrl, /VITE_API_URL/)
  })

  it('e a raiz lança junto: uma variável, um servidor', () => {
    // `apiOrigin` sai de `apiUrl` em vez de ter variável própria. Se ela tivesse um caminho
    // independente, o app poderia autenticar num servidor e buscar dado noutro.
    assert.throws(apiOrigin, /VITE_API_URL/)
  })

  it('a mensagem diz ONDE consertar', () => {
    // Erro de configuração que não diz onde se conserta custa uma hora de quem clonou o projeto.
    assert.throws(apiUrl, /\.env/)
  })
})

describe('o corte do `/v1` é ANCORADO no fim', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/lib/api-url.ts', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')

  /** O recorte como o módulo o escreve, aplicado às URLs que importam. */
  const { body: pattern, strip } = (() => {
    // A barra ESCAPADA faz parte do literal: `[^/]*` pararia no primeiro `\/` e não acharia nada.
    const match = source.match(/\.replace\((\/(?:\\.|[^/\\])+\/[a-z]*),\s*''\)/)
    assert.ok(match, 'o recorte do `/v1` mudou de forma — este teste precisa ser reescrito junto')
    const [, literal] = match
    const body = literal.slice(1, literal.lastIndexOf('/'))
    const flags = literal.slice(literal.lastIndexOf('/') + 1)
    return { body, strip: (url: string) => url.replace(new RegExp(body, flags), '') }
  })()

  it('a expressão termina em `$` — sem isso ela come um pedaço do caminho', () => {
    // É o ponto todo. `https://casa.com/v1/wlet` atrás de um caminho perderia o `/v1` do MEIO, e
    // o login iria para `https://casa.com/wlet` — uma origem que existe e responde outra coisa.
    assert.match(pattern, /\$$/, `o recorte do \`/v1\` deixou de ser ancorado no fim: ${pattern}`)
  })

  it('o sufixo sai, com ou sem barra final', () => {
    assert.equal(strip('http://localhost:3000/v1'), 'http://localhost:3000')
    assert.equal(strip('http://localhost:3000/v1/'), 'http://localhost:3000')
  })

  it('só o `/v1` do FIM sai', () => {
    assert.equal(strip('https://casa.com/v1/wlet/v1'), 'https://casa.com/v1/wlet')
  })

  it('endereço sem `/v1` não é mexido', () => {
    // Variável mal preenchida tem de chegar INTEIRA ao erro da requisição. Recortar um pedaço
    // dela transforma "apontei para o lugar errado" em "apontei para um lugar que não existe".
    assert.equal(strip('http://localhost:3000'), 'http://localhost:3000')
    assert.equal(strip('http://localhost:3000/apiv1'), 'http://localhost:3000/apiv1', '`v1` colado no nome não é o sufixo de versão')
    assert.equal(strip('http://localhost:3000/v10'), 'http://localhost:3000/v10', 'a versão 10 não é a versão 1 com um zero sobrando')
  })
})
