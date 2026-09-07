import type { MetricDefinition } from '@/components/kpi'

/** As definições dos KPIs de Planos, lidas do cálculo real de `src/lib/plans.ts`. */
export const PLANOS_METRICS: Record<'decided' | 'considering' | 'nextMonth', MetricDefinition> = {
  decided: {
    title: 'Decidido',
    whatItIs: 'A soma dos planos que você já resolveu fazer.',
    howItIsCalculated:
      'Soma do valor TOTAL — não o da parcela — de todo plano com situação "Decidido", TENHA ELE MÊS OU NÃO. Só os que têm mês chegam à previsão, onde aparecem como origem própria ao lado do declarado, do contratado e das rubricas; um plano sem mês não tem onde pesar e fica de fora até você marcar uma data. Quando existe algum nessa situação, a legenda do cartão diz quantos são — senão este total e o do gráfico divergiriam sem explicação.',
    whatItIsFor:
      'É o compromisso que você assumiu consigo mesmo. Se este número cresce sem a previsão apertar, é sinal de que os planos estão espalhados em meses distantes — o que é bom; se aperta, a folga de algum mês está sendo consumida.',
    formula: 'Σ valor total dos planos decididos (com mês ou sem)',
  },
  considering: {
    title: 'Em estudo',
    whatItIs: 'A soma dos planos que você ainda não decidiu.',
    howItIsCalculated: 'Soma do valor total de todo plano com situação "Em estudo". Eles NÃO entram na previsão: só aparecem quando você liga a simulação na tela de Previsão.',
    whatItIsFor:
      'É o tamanho da sua lista de desejos. O número sozinho não é uma dívida nem uma meta — é o que você teria de gastar se dissesse sim a tudo, e serve para dimensionar quanto da lista cabe de fato.',
    formula: 'Σ valor total dos planos em estudo',
  },
  nextMonth: {
    title: 'Cai no próximo mês',
    whatItIs: 'Quanto dos planos decididos vence no mês seguinte ao último com dados.',
    howItIsCalculated:
      'Para cada plano decidido, o valor da parcela que cai naquele mês — o total dividido pelo número de parcelas. Um plano à vista conta inteiro; um em 6× conta um sexto. Planos em estudo ficam de fora.',
    whatItIsFor: 'Responde "o que já está contratado comigo mesmo para o mês que vem". É o número que compete com as contas e as rubricas pela folga daquele mês.',
    formula: 'Σ (valor ÷ parcelas) dos planos decididos que caem no mês',
  },
}
