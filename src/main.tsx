import { setDataset, setDeclarations } from './lib/dataset'
import { setPreloaded } from './providers/preloaded'
import { services } from './services'
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

async function start(): Promise<void> {
  const { dataset, config, preferences, overrides, plans } = services()

  // Os três em paralelo: são armazenamentos independentes, e encadeá-los somaria três esperas
  // no caminho crítico do primeiro render.
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

start().catch((cause) => fail('Não foi possível ler o conjunto de dados nem a cópia que veio no aplicativo.', cause))
