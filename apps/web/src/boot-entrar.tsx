import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EntrarPageContent from './routes/entrar'
import { ThemeProvider } from './providers/theme'

/**
 * A montagem da tela de entrada, separada de `boot.tsx` pela MESMA razão que ele existe.
 *
 * `main.tsx` não pode importar nada que leia o portão, e a tela de entrada é justamente a que
 * roda ANTES dele — ela não tem dado nenhum para ler. Importá-la dinamicamente mantém a regra do
 * topo de `lib/dataset.ts` intacta e, de quebra, deixa o app inteiro fora do bundle de quem
 * ainda não entrou.
 *
 * Só o `ThemeProvider` vem junto: ele lê preferência do navegador e não toca em serviço nenhum.
 * Os outros providers dependem do dado que ainda não existe.
 */
export function mountEntrar(onEntrou: () => void): Root {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <StrictMode>
      <ThemeProvider>
        <EntrarPageContent onEntrou={onEntrou} />
      </ThemeProvider>
    </StrictMode>,
  )
  return root
}
