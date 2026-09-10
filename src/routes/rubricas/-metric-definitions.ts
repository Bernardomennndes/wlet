import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições do ⓘ desta tela.
 *
 * Ficam ao lado do `-content.tsx` e não dentro de `-components/`: quem as lê é a página.
 */
export const RUBRICAS_METRICS: Record<'planned' | 'spent' | 'left', MetricDefinition> = {
  planned: {
    title: 'Planejado no mês',
    whatItIs: 'A soma das rubricas declaradas — o que você espera gastar nas categorias sem credor único.',
    howItIsCalculated:
      'Soma do valor de cada rubrica. Uma rubrica composta vale a soma dos seus itens (quantidade × valor unitário); as demais valem o número digitado. Nunca os dois, para não haver duas respostas à mesma pergunta.',
    example: {
      scenario: 'Mercado com R$ 1.000 digitados e Suplementação composta de 2 × R$ 180 mais 1 × R$ 120.',
      calculation: ['suplementação = 360 + 120 = R$ 480', '1.000 + 480 = R$ 1.480 planejados'],
    },
    whatItIsFor: 'É quanto do teto do mês já está comprometido com gasto esperado, antes de qualquer conta com vencimento.',
    formula: 'Σ valor de cada rubrica',
  },
  spent: {
    title: 'Gasto no mês',
    whatItIs: 'Quanto já saiu, no mês em curso, das categorias que têm rubrica.',
    howItIsCalculated:
      'Soma das saídas do mês nas categorias declaradas, líquida de reembolso — uma entrada conciliada com uma cobrança abate a categoria que ela devolve, como no resto do app. Trava em zero: um rateio que chega num mês sem a despesa correspondente não vira gasto negativo.',
    whatItIsFor: 'É a metade medida da pergunta "estourei?". Como o mês costuma estar em curso, o número cresce conforme os lançamentos chegam ao extrato.',
    formula: 'Σ saídas do mês nas categorias com rubrica − reembolsos',
  },
  left: {
    title: 'Ainda cabe',
    whatItIs: 'O que sobra do planejado depois do que já foi gasto.',
    howItIsCalculated: 'Planejado menos gasto, somando todas as rubricas. Quando o gasto passa do planejado o número fica negativo, e a tela o nomeia como "Passou".',
    whatItIsFor: 'Responde quanto ainda dá para gastar sem furar o que foi planejado — a soma do que cada barra desta tela mostra por categoria.',
    formula: 'Σ planejado − Σ gasto',
  },
}
