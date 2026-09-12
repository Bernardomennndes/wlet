import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { translateRemoteError } from '@wlet/services/shared/domain/errors'
import { toast } from '@wlet/ui/toast'

/**
 * O cliente do React Query — e o ÚNICO lugar onde erro de escrita vira tela.
 *
 * A alternativa é tratar erro em cada `useMutation`, e ela se desfaz sozinha: nasce uma cópia por
 * escrita, cada uma livre para divergir das outras no texto, no tom e em lembrar de existir. Aqui
 * é uma instância, e uma escrita nova ganha o tratamento de erro sem escrever linha nenhuma.
 *
 * **A tradução é a MESMA dos adapters** (`translateRemoteError`), e isso não é reúso oportunista:
 * uma escrita pode chegar por `api.*.mutationOptions()`, direto do contrato, e aí o que estoura é
 * o `ORPCError` cru; ou por `services().x.y()`, e aí já vem traduzida. Passar as duas pela mesma
 * função é o que faz a pessoa ler a mesma frase para a mesma falha, independentemente do caminho.
 * Erro de domínio passa intacto, então a segunda passagem não estraga a primeira.
 *
 * **O SUCESSO não mora aqui de propósito.** Ele é declarado no `onSuccess` de cada ponto de uso,
 * porque só lá se sabe o que aconteceu — "Plano \"Monitor\" criado" informa; "Salvo com sucesso",
 * repetido trinta vezes, é ruído que a pessoa aprende a ignorar.
 */
function criarCliente(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Um extrato bancário não muda enquanto a aba está aberta: refazer a leitura a cada foco
        // gastaria rede para redesenhar o mesmo número. Quem sabe que mudou é a escrita, e ela
        // invalida.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        // 401 não melhora tentando de novo — a sessão não volta sozinha, e as tentativas só
        // atrasam a tela de entrada.
        retry: (falhas, erro) => falhas < 2 && !/expirou|acesso/i.test(erro instanceof Error ? erro.message : ''),
      },
      // Escrita NÃO se repete sozinha: "gravar de novo" pode significar gravar duas vezes, e não
      // há como saber daqui se a primeira chegou.
      //
      // O `networkMode` fica no padrão (`'online'`), e vale saber o que isso faz: com o navegador
      // OFFLINE a escrita é PAUSADA em vez de falhar, e retomada quando a rede volta. Medido: com
      // a rede desligada, um clique não dispara requisição nenhuma e não produz aviso — o que a
      // pessoa vê é o controle desabilitado, porque `isPending` fica verdadeiro enquanto pausa.
      // É o comportamento certo para este app (a escrita chega quando der), mas é preciso saber
      // que "sem toast" ali não é defeito da tradução de erro.
      mutations: { retry: false },
    },
    mutationCache: new MutationCache({
      onError: (erro) => toast.error(translateRemoteError(erro).message),
    }),
  })
}

/**
 * Instância criada UMA vez, dentro do `useState`.
 *
 * `new QueryClient()` no corpo do componente criaria um cliente novo a cada render, e com ele um
 * cache novo: toda leitura recomeçaria do zero e nada jamais seria compartilhado entre telas. É o
 * erro clássico deste provider, e ele não dá sintoma nenhum além de lentidão inexplicável.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(criarCliente)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
