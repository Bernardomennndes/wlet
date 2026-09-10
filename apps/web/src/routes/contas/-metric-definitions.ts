import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições dos KPIs da tela de Contas, lidas do cálculo real de `-content.tsx`:
 * `inflow`/`outflow` somam os lançamentos da própria conta dentro do período filtrado, e
 * `invested` soma as contrapartes de todo o histórico.
 */
export const CONTAS_METRICS: Record<'grossInflow' | 'grossOutflow' | 'investedBalance', MetricDefinition> = {
  grossInflow: {
    title: 'Entradas brutas da conta',
    whatItIs: 'Tudo que entrou na conta no período — "Entradas brutas" na conta corrente, "Pagamentos recebidos" no cartão de crédito.',
    howItIsCalculated:
      'Soma dos lançamentos da própria conta, dentro do período selecionado, cujo valor é positivo. Nada é excluído: transferência recebida de outra conta própria, pagamento de fatura e aporte devolvido entram na soma junto com a receita de verdade.',
    whatItIsFor:
      'É o movimento da conta, não o resultado dela. Diferente dos números da Visão geral, o valor é BRUTO: inclui as transferências entre contas próprias, então somar as entradas de todas as contas conta o mesmo dinheiro duas vezes. Serve para conferir o extrato do banco, não para medir receita.',
    formula: 'Σ valor dos lançamentos da conta no período com valor > 0',
  },
  grossOutflow: {
    title: 'Saídas brutas da conta',
    whatItIs: 'Tudo que saiu da conta no período — "Saídas brutas" na conta corrente, "Compras e encargos" no cartão de crédito.',
    howItIsCalculated:
      'Soma dos lançamentos da própria conta, dentro do período selecionado, cujo valor é negativo, com o sinal invertido para sair positivo. No cartão, o que entra são as compras pela data de competência (parcela deslocada mês a mês), não a fatura paga.',
    whatItIsFor:
      'Mesma ressalva das entradas: o valor é BRUTO e inclui as transferências entre contas próprias — o Pix para a XP e o pagamento da fatura aparecem aqui, embora não sejam despesa no consolidado. Não confronte com as despesas da Visão geral, que descontam essas duas pontas.',
    formula: 'Σ −valor dos lançamentos da conta no período com valor < 0',
  },
  investedBalance: {
    title: 'Saldo líquido aportado',
    whatItIs: 'Quanto dinheiro foi parar na conta investimento, descontado o que voltou dela.',
    howItIsCalculated:
      'Percorre TODAS as transações do conjunto de dados — não só as do período filtrado — e soma, com o sinal invertido, aquelas cuja contraparte é esta conta. Aporte sai da XP Conta com valor negativo e entra aqui positivo; resgate faz o caminho contrário e reduz o saldo.',
    whatItIsFor:
      'É o único número da tela que IGNORA o filtro de período: mudar o intervalo não o altera, porque saldo acumulado só faz sentido sobre todo o histórico. Não é patrimônio: a conta é virtual, não tem extrato próprio e portanto não sabe rendimento — mede o que foi aportado, não o que a carteira vale hoje.',
    formula: 'Σ −valor de todas as transações cuja contraparte é a conta investimento',
  },
}
