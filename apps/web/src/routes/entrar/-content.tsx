import { Warning } from '@phosphor-icons/react'
import { useState } from 'react'
import { HidingSquaresIcon } from '@/components/hiding-squares-icon'
import { auth } from '@/lib/auth'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { EntrarForm } from './-components/entrar-form'
import type { EntrarFormValues } from './-components/entrar-form-schema'

/**
 * A porta do app.
 *
 * Ela não vive dentro do `AppShell` e não é rota do `App.tsx`, e isso é consequência do portão
 * de boot: a barra lateral, os filtros e todas as telas leem constantes que só existem DEPOIS
 * das cinco leituras — e as cinco leituras exigem sessão. Montar a casca em volta de um app sem
 * dado daria uma tela de erro atrás de um menu que não navega para lugar nenhum.
 *
 * Por isso `main.tsx` monta ESTA tela OU o app, nunca as duas. O preço é que a entrada não tem
 * URL própria; o ganho é que não existe estado em que a casca aparece sem o que ela mostra.
 */
export function EntrarPageContent({ onEntrou }: { onEntrou: () => void }) {
  useDocumentTitle('Entrar')

  const [modo, setModo] = useState<'entrar' | 'cadastrar'>('entrar')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (values: EntrarFormValues) => {
    setEnviando(true)
    setErro(null)
    try {
      const cliente = auth()
      const resposta =
        modo === 'entrar'
          ? await cliente.signIn.email({ email: values.email, password: values.password })
          : await cliente.signUp.email({ email: values.email, password: values.password, name: values.name?.trim() || values.email })

      // O Better Auth devolve o erro no CORPO, não por exceção: sem esta leitura, senha errada
      // seguiria para `onEntrou()` e o app tentaria carregar dado com uma sessão que não existe.
      if (resposta.error) {
        setErro(mensagemDe(resposta.error))
        return
      }
      onEntrou()
    } catch (cause) {
      setErro(cause instanceof Error ? `Não foi possível falar com o servidor: ${cause.message}` : String(cause))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex items-center gap-2">
          <HidingSquaresIcon className="size-8 shrink-0" />
          <span className="font-mono text-lg font-semibold">WLET</span>
        </div>

        <Card>
          <CardHeader>
            {/* O `<h1>` fica DENTRO do `CardTitle` — ele é um `<div>` e não aceita `render`, e a
                tela de entrada não pode ser a única do app sem heading nenhum. Era: quem navega
                por títulos, que é como se varre uma página com leitor de tela, não achava nada na
                primeira tela que o app mostra. Mesma solução, e mesmo motivo, da rota 404. As
                classes restauram a tipografia do `CardTitle`. */}
            <CardTitle>
              <h1 className="font-heading text-sm font-bold">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
            </CardTitle>
            <CardDescription>Seus extratos ficam no seu servidor. A sessão é um cookie que script nenhum lê.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {erro && (
              <p className="text-destructive flex items-start gap-2 text-xs">
                <Warning className="mt-0.5 shrink-0" /> {erro}
              </p>
            )}

            {/* `key` no modo: trocar entre entrar e cadastrar REMONTA o formulário, e com ele o
                `useForm`. Sem isso o erro de validação do modo anterior sobrevive à troca e
                aparece sobre um campo que a pessoa ainda não tocou. */}
            <EntrarForm key={modo} modo={modo} enviando={enviando} onSubmit={enviar} />

            <Button
              variant="link"
              size="sm"
              className="self-center"
              onClick={() => {
                setModo((m) => (m === 'entrar' ? 'cadastrar' : 'entrar'))
                setErro(null)
              }}
            >
              {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

/**
 * A prosa do servidor traduzida, num lugar só.
 *
 * O Better Auth responde em inglês e por código; mostrar `INVALID_EMAIL_OR_PASSWORD` cru seria
 * o mesmo defeito que a §5.1 da `data-fetching.md` descreve para o erro de escrita. Quando o
 * handler global do React Query existir, esta função é a semente dele.
 */
function mensagemDe(error: { code?: string; message?: string }): string {
  const porCodigo: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'E-mail ou senha incorretos.',
    USER_ALREADY_EXISTS: 'Já existe uma conta com esse e-mail.',
    PASSWORD_TOO_SHORT: 'A senha precisa de pelo menos 10 caracteres.',
  }
  return (error.code && porCodigo[error.code]) || error.message || 'Não foi possível entrar.'
}
