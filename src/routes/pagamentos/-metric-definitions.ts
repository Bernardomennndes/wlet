import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições dos KPIs de Pagamentos, lidas do cálculo real de `-content.tsx`:
 * `settlePlanned` produz uma ocorrência por conta e por mês, e as rubricas de
 * `budget.config.ts` são medidas contra o gasto do mês.
 */
export const PAGAMENTOS_METRICS: Record<'dueThisMonth' | 'overdue' | 'rubricUse', MetricDefinition> = {
  dueThisMonth: {
    title: 'A pagar no mês',
    whatItIs: 'Quanto ainda falta sair das contas declaradas que vencem no mês em curso.',
    howItIsCalculated:
      'Para cada conta que incide no último mês com dados, o valor esperado menos o que já saiu. Só a diferença positiva conta. Contas já pagas ficam de fora, e uma conta paga a mais não gera crédito negativo aqui.',
    whatItIsFor: 'É a lista do que ainda vai sair da conta. Como o mês corrente quase sempre está em curso, o número encolhe conforme os pagamentos chegam ao extrato.',
    formula: 'Σ máx(0, esperado − pago) das contas do mês em curso',
  },
  overdue: {
    title: 'Em atraso',
    whatItIs: 'O que já venceu e não saiu, somando todos os meses da janela.',
    howItIsCalculated:
      '"Já venceu" é medido contra a última data COM DADO nos extratos, não contra o relógio: uma conta paga ontem e ainda não exportada do banco não pode ser declarada atrasada. Regra sem dia de vencimento nunca entra aqui — sem dia não há prazo a vencer.',
    whatItIsFor: 'Separa o esquecimento do atraso real. Uma conta em aberto dentro do prazo não aparece.',
    formula: 'Σ esperado das ocorrências com vencimento passado e nada pago',
  },
  rubricUse: {
    title: 'Rubricas no mês',
    whatItIs: 'Quanto já foi gasto do que se planejou para as categorias sem credor único.',
    howItIsCalculated:
      'Soma das saídas do mês em curso nas categorias declaradas em `budget.config.ts`, contra a soma dos valores planejados. As saídas são líquidas de reembolso, como no resto do app.',
    example: {
      scenario: 'Uma rubrica de R$ 1.000 para mercado, com R$ 640 já gastos no mês.',
      calculation: ['640 ÷ 1.000 = 64% do planejado', 'ainda cabem R$ 360'],
    },
    whatItIsFor:
      'É o teto do que não tem vencimento. Alimentação não é uma conta a pagar — não existe "a conta do mercado" —, então a pergunta certa não é "paguei?" e sim "estourei?". Nos meses futuros esse mesmo número vira previsão de saída.',
    formula: 'Σ gasto do mês nas categorias com rubrica ÷ Σ rubricas',
  },
}
