import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições dos KPIs de Cobranças, lidas do cálculo real de `-content.tsx`: `settle`
 * produz uma ocorrência por cobrança e por mês, e os três números abaixo são recortes dela.
 */
export const COBRANCAS_METRICS: Record<'openThisMonth' | 'overdue' | 'offsetInPeriod', MetricDefinition> = {
  openThisMonth: {
    title: 'A receber no mês',
    whatItIs: 'Quanto ainda falta entrar das cobranças que vencem no mês em curso.',
    howItIsCalculated:
      'Para cada cobrança que incide no último mês com dados, o valor esperado menos o que já entrou. Só a diferença positiva conta: quem pagou a mais não gera crédito negativo aqui. Cobranças já quitadas ficam de fora.',
    example: {
      scenario: 'Duas cobranças de R$ 700 no mês: uma com R$ 480,00 já recebidos, outra sem nenhuma entrada.',
      calculation: ['700,00 − 480,00 = 220,00', '700,00 − 0,00 = 700,00', '220,00 + 700,00 = R$ 920,00 a receber'],
    },
    whatItIsFor: 'É a lista do que cobrar. Como o mês corrente quase sempre está em curso, o número encolhe conforme os recebimentos chegam ao extrato.',
    formula: 'Σ máx(0, esperado − recebido) das cobranças do mês em curso',
  },
  overdue: {
    title: 'Em atraso',
    whatItIs: 'O que já venceu e não entrou, somando todos os meses da janela.',
    howItIsCalculated:
      'Uma ocorrência está em atraso quando a data de vencimento dela já passou e nada foi recebido. "Já passou" é medido contra a última data COM DADO nos extratos, não contra o relógio: um pagamento que aconteceu ontem e ainda não foi exportado do banco não pode ser declarado calote.',
    whatItIsFor: 'Separa o esquecimento do atraso real. Um mês em aberto dentro do prazo não aparece aqui.',
    formula: 'Σ esperado das ocorrências com vencimento passado e recebido = 0',
  },
  offsetInPeriod: {
    title: 'Abatido no período',
    whatItIs: 'Quanto os recebimentos já tiraram das suas despesas dentro do período do cabeçalho.',
    howItIsCalculated:
      'Soma das entradas conciliadas com alguma cobrança, dentro do período selecionado. É o mesmo valor que sai da categoria de despesa correspondente na Visão geral e em Categorias — a parte do gasto que nunca foi sua.',
    example: {
      scenario: 'Oito meses de rateio do aluguel, entre R$ 560,00 e R$ 720,00 — dois deles pagos por um familiar do devedor.',
      calculation: ['720,00 + 700,00 + 700,00 + 615,40 + 640,00 + 560,00 + 668,30 + 700,00', '= R$ 5.303,70 a menos em Moradia'],
    },
    whatItIsFor: 'Torna visível o efeito contábil do módulo. Sem ele, o abatimento aconteceria sem nenhum lugar que o explicasse.',
    formula: 'Σ valor das entradas com cobrança conciliada no período',
  },
}
