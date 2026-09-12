import { ArrowsClockwise } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Declarations } from '@wlet/ingest/pipeline'
import { toast } from '@wlet/ui/toast'
import { api } from '@/api'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { declarations } from '@/lib/dataset'
import { services } from '@/services'
import { AccountsSection } from './-components/accounts-section'
import { BudgetSection } from './-components/budget-section'
import { GoalsSection } from './-components/goals-section'
import { ReceivablesSection } from './-components/receivables-section'
import { RulesSection } from './-components/rules-section'

/**
 * O que você declara ao app, editável aqui em vez de num arquivo `.ts`.
 *
 * As outras telas leem constantes fixadas no BOOT, então uma alteração aqui não muda a Previsão
 * na mesma hora. A tela diz isso em vez de fingir: prometer efeito imediato e não entregar é pior
 * do que pedir um recarregamento.
 *
 * **Os lançamentos previstos saíram daqui** para a tela de Previsão, onde eles se leem: lá a
 * lista fica ao lado do gráfico e da tabela que eles alimentam, e editar move os três na hora.
 * Aqui a lista era um formulário cego para o próprio efeito.
 *
 * E há uma segunda distinção, que não é óbvia: perfil de conta e regra de categoria agem
 * durante a LEITURA dos arquivos, então elas não bastam recarregar — precisam de reprocessar,
 * em Meus dados. As outras três só precisam de recarregar.
 */

/**
 * A leitura da configuração: chave do CONTRATO, função do SERVIÇO.
 *
 * A §4 manda a chave vir do contrato, e ela vem — `api().config.get.key()`. O que NÃO vem é o
 * `queryFn` de fábrica, e a razão é que a forma do fio não é a forma do domínio: `rules` e
 * `accounts` carregam `RegExp`, que em JSON viaja como `{source, flags}`. O `queryFn` do contrato
 * entregaria à tela um objeto em que toda expressão regular é `{}` — sem erro nenhum, que é o
 * pior modo de errar. Quem faz a travessia é o adapter, e `load()` ainda cai na semente quando o
 * servidor não tem nada.
 *
 * É por isso também que o `queryOptions()` inteiro não é espalhado aqui: ele traz o TIPO do fio
 * junto, e a entrada de cache passaria a mentir sobre o que guarda — o `setQueryData` abaixo foi
 * onde o compilador pegou. A chave é a mesma; o conteúdo é o do domínio, e está dito.
 *
 * **Quando a conversão migrar para `packages/api/src/shared/shape.ts`**, exportada e usada dos
 * dois lados, este desvio deixa de existir: aí a leitura volta a ser `queryOptions()` inteiro.
 *
 * `initialData` é o retrato que o portão de boot já carregou: sem ele a tela piscaria um estado
 * de carregamento para um dado que o app tem em mãos desde antes de montar.
 */

export function ConfiguracaoPageContent() {
  useDocumentTitle('Configuração')
  const queryClient = useQueryClient()
  // Inline, como a §3.4 pede — a explicação do desvio está no bloco acima.
  const { data: declarado } = useQuery({ queryKey: api().config.get.key(), queryFn: () => services().config.load(), initialData: declarations })

  /**
   * Cinco escritas, cinco `useMutation`, cinco frases — e é assim de propósito.
   *
   * Uma fábrica que recebesse a mensagem por parâmetro seria menor e diria menos: o texto
   * deixaria de ser do ponto de uso, e a primeira seção nova nasceria com "Salvo com sucesso". A
   * regra de escrita é explícita aqui, e o custo em linhas é o preço de o aviso informar.
   *
   * **Nenhuma delas trata erro.** Ele é um só, no `MutationCache` do provider — uma cópia por
   * escrita seria cinco textos livres para divergir.
   */
  const gravar = (parte: Partial<Declarations>) => services().config.replace({ ...declarado, ...parte })

  /**
   * O que o servidor devolveu entra no cache NA HORA, e a chave é invalidada em seguida.
   *
   * As duas coisas, e não uma: sem o `setQueryData`, duas edições seguidas partiriam do mesmo
   * retrato e a segunda gravaria por cima da primeira — era o que o `latest` do hook antigo
   * existia para impedir. Sem a invalidação, a tela passaria a confiar na resposta de uma
   * escrita como se fosse leitura.
   */
  const aplicar = (proximo: Declarations) => {
    queryClient.setQueryData(api().config.get.key(), proximo)
    void queryClient.invalidateQueries({ queryKey: api().config.key() })
  }

  const { mutate: gravarTeto, isPending: gravandoTeto } = useMutation({
    mutationFn: (budget: Declarations['budget']) => gravar({ budget }),
    onSuccess: (proximo) => {
      aplicar(proximo)
      toast.success('Teto e rubricas guardados')
    },
  })

  const { mutate: gravarCobrancas, isPending: gravandoCobrancas } = useMutation({
    mutationFn: (receivables: Declarations['receivables']) => gravar({ receivables }),
    onSuccess: (proximo) => {
      aplicar(proximo)
      toast.success('Cobranças guardadas')
    },
  })

  const { mutate: gravarMetas, isPending: gravandoMetas } = useMutation({
    mutationFn: (goals: Declarations['goals']) => gravar({ goals }),
    onSuccess: (proximo) => {
      aplicar(proximo)
      toast.success('Metas guardadas')
    },
  })

  const { mutate: gravarContas, isPending: gravandoContas } = useMutation({
    mutationFn: (accounts: Declarations['accounts']) => gravar({ accounts }),
    onSuccess: (proximo) => {
      aplicar(proximo)
      // A frase nomeia o que falta fazer, porque perfil de conta age na LEITURA do arquivo: sem
      // reprocessar, a mudança está guardada e não vale para lançamento nenhum.
      toast.success('Perfis de conta guardados — reprocesse em Meus dados para valerem')
    },
  })

  const { mutate: gravarRegras, isPending: gravandoRegras } = useMutation({
    mutationFn: (rules: Declarations['rules']) => gravar({ rules }),
    onSuccess: (proximo) => {
      aplicar(proximo)
      toast.success('Regras de categoria guardadas — reprocesse em Meus dados para valerem')
    },
  })

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Configuração</h1>
          <p className="text-muted-foreground text-xs">O que você declara ao app. Fica guardado no servidor.</p>
        </div>
      </header>

      {/* A ordem é a do que se mexe com mais frequência: teto e rubricas primeiro, perfis de
          conta e regras por último — os dois que quase nunca mudam e que, quando mudam, pedem
          reprocessamento. O `disabled` de cada seção é o `isPending` da PRÓPRIA escrita: um
          estado global desabilitaria as cinco por causa de uma. */}
      <BudgetSection budget={declarado.budget} disabled={gravandoTeto} onChange={(budget) => gravarTeto(budget)} />
      <ReceivablesSection receivables={declarado.receivables} disabled={gravandoCobrancas} onChange={(receivables) => gravarCobrancas(receivables)} />
      <GoalsSection goals={declarado.goals} disabled={gravandoMetas} onChange={(goals) => gravarMetas(goals)} />

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <ArrowsClockwise className="mt-0.5 shrink-0" />
        As duas seções abaixo agem na LEITURA dos arquivos: mudá-las exige <strong className="text-foreground font-medium">reprocessar</strong> em Meus dados, não só recarregar.
      </p>

      <AccountsSection accounts={declarado.accounts} disabled={gravandoContas} onChange={(accounts) => gravarContas(accounts)} />
      <RulesSection rules={declarado.rules} disabled={gravandoRegras} onChange={(rules) => gravarRegras(rules)} />
    </div>
  )
}
