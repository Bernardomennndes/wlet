import { setDataset } from './lib/dataset'
import { loadDataset } from './lib/dataset-store'
import './index.css'

/**
 * O portão de boot: carrega o dataset ANTES de qualquer módulo que o consuma.
 *
 * Os módulos de `src/lib/` exportam constantes (`TRANSACTIONS`, `PLANNED`, `BUDGET`) lidas por
 * 25 arquivos. Enquanto o dado vinha de `import x from '*.json'`, isso era gratuito — o
 * bundler resolvia tudo antes do primeiro render. Vindo do IndexedDB, que é assíncrono, a
 * única forma de manter aquelas constantes (e portanto os 25 consumidores) intactas é carregar
 * primeiro e só então montar o app.
 *
 * **Nada de `src/lib/` ou `src/routes/` pode ser importado estaticamente aqui.** Os dois
 * imports acima são a exceção autorizada: nenhum deles LÊ o dataset ao ser avaliado. O app
 * entra por `import('./boot')`, dinâmico, depois do portão.
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
  const { data, origin } = await loadDataset()
  setDataset(data)
  if (origin !== 'indexeddb') {
    // Não é erro — é o primeiro boot, ou um navegador sem IndexedDB. Fica no console porque a
    // origem do dado é a primeira coisa que se quer saber quando um número parece errado.
    console.info(`[wlet] dataset carregado da origem: ${origin}`)
  }
  const { mount } = await import('./boot')
  mount()
}

start().catch((cause) => fail('Não foi possível ler o conjunto de dados nem a cópia que veio no aplicativo.', cause))
