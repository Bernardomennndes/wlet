import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições dos KPIs da Visão geral, lidas do cálculo real — `summarizeByMonth`/`sum` em
 * `src/lib/finance.ts` e `buildForecast` em `src/lib/forecast.ts` —, não do rótulo.
 * `whatItIsFor` guarda a armadilha de leitura de cada número.
 */
export const OVERVIEW_METRICS = {
  income: {
    title: 'Entradas no período',
    whatItIs: 'Tudo que entrou nas contas do recorte, dentro do período do filtro.',
    howItIsCalculated:
      'Cada lançamento do período recebe um fluxo pelo recorte vigente (`flowOf`); soma-se o valor dos que ficaram como entrada, mês a mês, e depois somam-se os meses. Uma transferência entre duas contas suas só é neutra quando AS DUAS pontas estão no recorte — na visão Empresa, o Pix do Inter para a XP deixa de ser transferência e entra como saída da PJ; na visão Pessoa física, a mesma operação entra como entrada.',
    whatItIsFor:
      'Dimensionar o faturamento do recorte. A armadilha é achar que todo dinheiro que caiu na conta está aqui: mover dinheiro entre contas suas não é receita, então um mês em que você só transferiu da PJ para a PF aparece com entrada zero no consolidado.',
    formula: 'soma das entradas de cada mês do período',
  },
  expense: {
    title: 'Saídas no período',
    whatItIs: 'Tudo que saiu das contas do recorte, dentro do período do filtro.',
    howItIsCalculated:
      'Mesmo caminho das entradas, pelo outro lado: os lançamentos classificados como saída entram com o sinal invertido (o número exibido é positivo). Compra no cartão conta pela data da COMPRA e cada parcela cai no mês dela; o pagamento da fatura é transferência e não é somado de novo — por isso não se soma fatura mais compras.',
    whatItIsFor:
      'Dimensionar o custo do recorte. Transferência entre contas próprias não entra aqui, então pagar a fatura do cartão não aparece como saída — o que aparece são as compras que a compuseram, nos meses em que foram feitas.',
    formula: 'soma das saídas de cada mês do período',
  },
  expenseAverage: {
    title: 'Média mensal de saídas',
    whatItIs: 'Quanto sai por mês, em média, dentro do período.',
    howItIsCalculated:
      'Divide o total de saídas pela quantidade de meses COM LANÇAMENTOS (`count > 0`), não pelo tamanho do período. Esticar o filtro para meses futuros, ainda sem extrato, não muda o divisor.',
    whatItIsFor:
      'Servir de régua para o mês corrente e para a previsão. A armadilha é o divisor: se o período tem seis meses mas só quatro têm extrato, a média divide por quatro — caso contrário meses vazios diluiriam o valor e a média cairia sem que nada tivesse mudado no gasto.',
    formula: 'total de saídas ÷ meses com lançamentos',
    example: {
      scenario: 'Período de jan a jun, com extrato só até abril, somando R$ 24.000 em saídas:',
      calculation: ['24.000 ÷ 4 (meses com lançamentos)', '= R$ 6.000', 'e não 24.000 ÷ 6 = R$ 4.000'],
    },
  },
  net: {
    title: 'Resultado no período',
    whatItIs: 'Entradas menos saídas do período, só do que já aconteceu.',
    howItIsCalculated: 'Total de entradas menos total de saídas dos meses do período. Nada de previsão entra nesta conta.',
    whatItIsFor:
      'Responder "o período fechou no azul?" com dado medido. É por isso que ele difere do resultado com a previsão logo abaixo do gráfico: aqui só há extrato, lá há extrato mais o que está cadastrado para os meses futuros.',
    formula: 'entradas − saídas',
  },
  forecastExpense: {
    title: 'Saídas previstas',
    whatItIs: 'Saídas esperadas nos meses do período que ainda não têm extrato.',
    howItIsCalculated:
      'Para cada mês além do último com lançamentos, soma-se o valor das regras de saída cadastradas em Previsão que ocorrem naquele mês MAIS as parcelas de cartão já compradas cuja cobrança ainda vai cair. Nada é extrapolado do histórico: o que não estiver cadastrado ou contratado não aparece.',
    whatItIsFor: 'Ver o compromisso que já está de pé antes de o mês começar. Atenção ao contratado logo ao lado: ele está CONTIDO neste número — somar os dois contaria as parcelas duas vezes.',
    formula: 'regras de saída cadastradas + parcelas já contratadas',
  },
  forecastCommitted: {
    title: 'Já contratado em parcelas',
    whatItIs: 'A parte das saídas previstas que já está contratada em parcelas de cartão.',
    howItIsCalculated:
      'Para cada compra parcelada já lançada, projetam-se as parcelas que faltam (`total − atual`), uma por mês à frente, e somam-se as que caem nos meses previstos. É a única parte da previsão que não vem de regra cadastrada — é fato, e por isso entra sozinha.',
    whatItIsFor:
      'Separar o que é decisão do que já é dívida: este pedaço não se corta cancelando um plano, ele já foi comprado. É um SUBCONJUNTO das saídas previstas, não uma parcela adicional a somar.',
    formula: 'soma das parcelas em aberto que caem nos meses previstos',
  },
  forecastIncome: {
    title: 'Entradas previstas',
    whatItIs: 'Entradas esperadas nos meses do período que ainda não têm extrato.',
    howItIsCalculated: 'Soma das regras de entrada cadastradas em Previsão que ocorrem em cada mês previsto. Não há contraparte de "contratado" aqui: receita não gera parcela a receber neste modelo.',
    whatItIsFor:
      'Confrontar com as saídas previstas. Como nada é extrapolado do histórico, um mês sem regra cadastrada aparece com entrada zero — isso indica cadastro faltando, não queda de faturamento.',
    formula: 'soma das regras de entrada cadastradas',
  },
  netWithForecast: {
    title: 'Resultado do período com a previsão',
    whatItIs: 'Resultado do período somando o que já aconteceu com o que está previsto.',
    howItIsCalculated: 'Resultado medido (entradas − saídas dos meses com extrato) mais o resultado previsto de cada mês futuro (entradas previstas − saídas previstas).',
    whatItIsFor:
      'Enxergar onde o período termina se nada mudar. Ele MISTURA medido com previsto: a metade da frente tem a mesma confiança do extrato, a de trás vale o que valerem as regras cadastradas — e some inteira quando o filtro não passa do último mês com lançamentos.',
    formula: 'resultado medido + resultado previsto',
  },
} satisfies Record<string, MetricDefinition>
