import { useQuery } from '@tanstack/react-query'
import { decidedPlans, type PlansData } from '@wlet/domain/plans'
import { api } from '@/api'
import { preloaded } from '@/providers/preloaded'
import { services } from '@/services'

/**
 * A LEITURA do catálogo de planos — e só ela.
 *
 * Havia um `PlansProvider` aqui, e ele era o último caminho de escrita fora do padrão da §5: um
 * `run(operation, after)` que embrulhava as seis mutações, engolia a falha num `console.error` e
 * dava a MESMA frase para adicionar um plano e apagar um grupo. Ninguém via o erro, e o sucesso
 * não era anunciado em lugar nenhum. As seis viraram `useMutation` no ponto de uso, em
 * `routes/planos/-content.tsx`.
 *
 * O que restou é leitura, e ela não precisava de provider: três telas leem o catálogo, e o que as
 * mantém em acordo é a CHAVE DE CACHE — a mesma para as três, vinda do contrato, como a §4 exige.
 * Um provider por cima disso só acrescentaria uma segunda cópia do mesmo dado.
 *
 * **`queryFn` do serviço, e não o de fábrica**, pelo mesmo motivo do `config`: o servidor guarda o
 * catálogo como JSON OPACO e não confere a forma. Quem confere é `parsePlans`, dentro do serviço —
 * um item torto é descartado em silêncio em vez de derrubar a lista inteira. O `queryFn` do
 * contrato entregaria o JSON cru.
 *
 * `initialData` é o retrato que o portão de boot já carregou: sem ele as três telas piscariam um
 * estado de carregamento para um dado que o app tem em mãos desde antes de montar.
 */
export function usePlansQuery() {
  return useQuery({ queryKey: api().plans.list.key(), queryFn: () => services().plans.list(), initialData: () => preloaded().plans })
}

/**
 * O catálogo já separado: tudo, e só os DECIDIDOS.
 *
 * `decided` é derivado na leitura e não guardado: quem monta a previsão REAL lê daqui, e a
 * simulação passa `items` inteiro e escolhe o que ligar. Derivar é de graça (`decidedPlans` é um
 * filtro) e guardar seria uma segunda verdade sobre o mesmo catálogo.
 */
export function usePlans(): PlansData & { decided: ReturnType<typeof decidedPlans> } {
  const { data } = usePlansQuery()
  return { ...data, decided: decidedPlans(data.items) }
}
