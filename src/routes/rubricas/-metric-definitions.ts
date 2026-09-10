import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições do ⓘ desta tela.
 *
 * Ficam ao lado do `-content.tsx` e não dentro de `-components/`: quem as lê é a página.
 */
export const RUBRICAS_METRICS: Record<'planned' | 'spent' | 'left', MetricDefinition> = {
  planned: {
    // Os títulos são NEUTROS quanto à base porque a tela alterna entre semana e mês: um ⓘ que
    // abrisse "Planejado no mês" sobre um cartão que diz "Planejado na semana" contradiria o
    // rótulo que o próprio conteúdo faz questão de manter acompanhando o número.
    title: 'Planejado na janela',
    whatItIs: 'A soma das rubricas declaradas — o que você espera gastar nas categorias sem credor único.',
    howItIsCalculated:
      'Soma do valor de cada rubrica. Uma rubrica composta vale a soma dos seus itens, e cada item é convertido para o MÊS pela cadência declarada: quantidade × valor unitário × ocorrências no mês — 30,417 por dia, 4,345 por semana, 1 por mês, todas do mesmo ano civil de 365 dias. As demais valem o número digitado. Nunca os dois, para não haver duas respostas à mesma pergunta. Na base semana o total é dividido por 4,345.',
    example: {
      scenario: 'Mercado com R$ 1.000 digitados e Suplementação composta de 2 kg de frango por SEMANA a R$ 22 mais 1 pote por mês a R$ 120.',
      calculation: ['frango = 2 × 22 × 4,345 = R$ 191,19/mês', 'pote = 1 × 120 × 1 = R$ 120,00/mês', 'suplementação = R$ 311,19', '1.000 + 311,19 = R$ 1.311,19 planejados'],
    },
    whatItIsFor:
      'É quanto do teto já está comprometido com gasto esperado, antes de qualquer conta com vencimento. Na base SEMANA o número é o mensal dividido por 4,345 — a rubrica é declarada por mês, e dividi-la é o único jeito de compará-la com sete dias de gasto sem remedir nada.',
    formula: 'Σ valor de cada rubrica (÷ 4,345 na base semana)',
  },
  spent: {
    title: 'Gasto na janela',
    whatItIs: 'Quanto já saiu, na janela lida, das categorias que têm rubrica.',
    howItIsCalculated:
      'Soma das saídas da JANELA lida — o mês em curso ou a semana de segunda a domingo, conforme a base escolhida no cabeçalho — nas categorias declaradas, líquida de reembolso — uma entrada conciliada com uma cobrança abate a categoria que ela devolve, como no resto do app. Trava em zero: um rateio que chega num mês sem a despesa correspondente não vira gasto negativo.',
    whatItIsFor:
      'É a metade medida da pergunta "estourei?". Como a janela costuma estar em curso, o número cresce conforme os lançamentos chegam ao extrato. A semana vai de segunda a domingo e pode ATRAVESSAR a virada do mês — por isso ela às vezes mostra mais que o mês corrente, que começa no dia 1º.',
    formula: 'Σ saídas da janela nas categorias com rubrica − reembolsos',
  },
  left: {
    title: 'Ainda cabe',
    whatItIs: 'O que sobra do planejado depois do que já foi gasto.',
    howItIsCalculated: 'Planejado menos gasto na mesma janela, somando todas as rubricas. Quando o gasto passa do planejado o número fica negativo, e a tela o nomeia como "Passou".',
    whatItIsFor: 'Responde quanto ainda dá para gastar sem furar o que foi planejado — a soma do que cada barra desta tela mostra por categoria.',
    formula: 'Σ planejado − Σ gasto',
  },
}
