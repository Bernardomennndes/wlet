import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { Provider } from './providers/_index'

/**
 * A montagem do app, separada de `main.tsx` de propósito.
 *
 * `main.tsx` não pode importar nada de `src/lib/` nem de `src/routes/` — a regra escrita no
 * topo de `src/lib/dataset.ts`. Import é avaliado ANTES da primeira linha do módulo, então um
 * `import App from './App'` lá em cima faria `finance.ts` rodar `dataset()` antes de o portão
 * ter sido preenchido, e o app morreria no boot com a mensagem daquele erro.
 *
 * Este arquivo existe para ser importado DINAMICAMENTE, depois do portão. É por isso que ele é
 * um módulo à parte e não uma função dentro do `main`.
 */
export function mount(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Provider>
        <App />
      </Provider>
    </StrictMode>,
  )
}
