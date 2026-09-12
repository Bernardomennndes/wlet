import { setDataset, setDeclarations } from './lib/dataset'
import { setPreloaded } from './providers/preloaded'
import { services } from '@/services'
import './index.css'

/**
 * O portão de boot: carrega o que os módulos consomem ANTES de eles existirem.
 *
 * Os módulos de `src/lib/` exportam constantes (`TRANSACTIONS`, `PLANNED`, `BUDGET`) lidas por
 * 25 arquivos, e os providers leem preferência e ajustes dentro de um inicializador de
 * `useState`, que é síncrono. Enquanto tudo vinha de `import x from '*.json'` e de
 * `localStorage`, isso era gratuito. Com IndexedDB no meio, a única forma de manter as duas
 * coisas é carregar primeiro e montar depois.
 *
 * **Nada que LEIA esse estado pode ser importado estaticamente aqui.** Os três imports acima
 * são a exceção autorizada: nenhum deles toca armazenamento ao ser avaliado — `services()` só
 * monta os adapters quando chamado. O app entra por `import('./boot')`, dinâmico e depois do
 * portão.
 */
function fail(message: string, cause: unknown): void {
  // Boot que falha não pode deixar tela branca. Sem isto, qualquer erro daqui vira uma página
  // em branco sem pista nenhuma — que foi exatamente o que aconteceu na primeira montagem.
  console.error('[wlet] falha no boot:', cause)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<div style="font:14px system-ui;padding:2rem;max-width:46rem;margin:0 auto"><h1 style="font-size:1.1rem">O aplicativo não conseguiu carregar os dados</h1><p style="color:#666">${message}</p><pre style="white-space:pre-wrap;color:#666;font-size:12px">${String(cause instanceof Error ? (cause.stack ?? cause.message) : cause)}</pre></div>`
  }
}

/**
 * Carrega o que os módulos consomem e monta o app. Só roda com sessão.
 *
 * As cinco leituras são `/v1/*`, e `apps/api` devolve 401 em todas sem sessão — então chamá-las
 * antes da porta não daria "app vazio", daria a tela de falha do `fail()`.
 */
async function carregarEMontar(): Promise<void> {
  const { dataset, config, preferences, overrides, plans } = services()

  // Os cinco em paralelo: são armazenamentos independentes, e encadeá-los somaria cinco
  // esperas no caminho crítico do primeiro render.
  const [loaded, declared, prefs, over, catalogue] = await Promise.all([dataset.load(), config.load(), preferences.load(), overrides.list(), plans.list()])

  setDataset(loaded.data)
  setDeclarations(declared)
  setPreloaded({ preferences: prefs, overrides: over, plans: catalogue, datasetOrigin: loaded.origin })

  if (loaded.origin !== 'indexeddb') {
    // Não é erro — é o primeiro boot, ou um navegador sem IndexedDB. Fica no console porque a
    // origem do dado é a primeira coisa que se quer saber quando um número parece errado.
    console.info(`[wlet] dataset carregado da origem: ${loaded.origin}`)
  }

  const { mount } = await import('./boot')
  mount()
}

/**
 * A PORTA, antes do portão.
 *
 * A sessão é conferida primeiro porque tudo o que vem depois depende dela. Sem sessão montamos a
 * tela de entrada — e nada mais: nenhuma leitura, nenhum provider, nenhuma casca. Entrar
 * desmonta aquela raiz e chama `carregarEMontar`, que é o mesmo caminho de quem já tinha sessão.
 *
 * O cookie é `httpOnly`, então o app não consegue olhá-lo: quem responde "há sessão?" é o
 * servidor, e é por isso que isto é uma chamada e não uma leitura local.
 */
async function start(): Promise<void> {
  const { auth } = await import('./auth')

  /**
   * Servidor fora do ar conta como SEM sessão, e não como falha de boot.
   *
   * Se `getSession()` rejeitar — API desligada, rede caída — subir isso para o `fail()` daria a
   * página de erro em vez da tela de entrada, que é justamente a única tela útil nesse estado:
   * é dela que a pessoa tenta de novo, e é o botão dela que mostra o erro de verdade com a
   * mensagem do servidor. Um app que não abre quando a API está fora não é mais seguro — é só
   * mais difícil de diagnosticar.
   */
  const sessao = await auth()
    .getSession()
    .catch(() => null)

  if (sessao?.data?.session) {
    await carregarEMontar()
    return
  }

  const { mountEntrar } = await import('./boot-entrar')
  const raiz = mountEntrar(() => {
    // `unmount` antes de montar de novo: duas raízes no mesmo nó deixam o React avisando no
    // console e a tela antiga viva por baixo.
    raiz.unmount()
    void carregarEMontar().catch((cause) => fail('Não foi possível carregar os dados depois de entrar.', cause))
  })
}

start().catch((cause) => fail('Não foi possível falar com o servidor para saber se você já entrou.', cause))
