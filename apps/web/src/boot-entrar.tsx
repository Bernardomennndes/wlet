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
 * Só o `ThemeProvider` vem junto, e ele não CHAMA nada aqui: a gravação da escolha mora no
 * handler de trocar o tema, e esta tela não tem esse botão. Enquanto a gravação estava no efeito,
 * montar esta tela disparava duas escritas de preferência sem sessão — dois 401 e dois erros no
 * console de quem só queria entrar. Os outros providers dependem do dado que ainda não existe.
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
