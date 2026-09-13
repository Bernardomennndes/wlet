import type { MetricDefinition } from '@/components/kpi'

/**
 * As definições dos KPIs de Patrimônio, lidas do cálculo real de `scripts/investments.ts` e
 * de `scripts/brokerage.ts`.
 */
export const PATRIMONIO_METRICS: Record<'current' | 'contributed' | 'gain' | 'windowEnd' | 'benchmark', MetricDefinition> = {
  /**
   * O número do cartão-herói. Ele NÃO é o `current`, e a distinção é o motivo de existir:
   * `current` é o snapshot de agora, este é o fim da janela que o período do cabeçalho recorta.
   */
  windowEnd: {
    title: 'Patrimônio no fim da janela',
    whatItIs: 'Quanto a carteira valia no último mês do período selecionado — o ponto onde a curva termina.',
    howItIsCalculated:
      'É o último ponto da série reconstruída, depois do recorte de período. A série inteira é reconstruída desde o primeiro mês com dado e só então cortada: o corte é de EXIBIÇÃO, senão o rendimento acumulado passaria a depender do filtro.',
    whatItIsFor:
      'Ler o fim da curva que está na tela. **Ele diverge do "Patrimônio" da fileira acima sempre que o período termina antes do último mês com dado** — aquele é o snapshot de agora, vindo da posição exportada da B3, e este é o valor do mês em que a janela termina. Com o período terminando em março, nos dados de exemplo, um dizia R$ 65.565,52 e o outro R$ 83.061,84. Por isso o mês entra no rótulo.',
    formula: 'total do último ponto dentro do período',
  },
  /** O desvio contra o CDI, do `benchmark-card`. */
  benchmark: {
    title: 'Contra o CDI',
    whatItIs: 'Quanto a carteira está acima ou abaixo do que os MESMOS aportes teriam rendido no CDI cheio.',
    howItIsCalculated:
      'Razão entre os dois valores, não diferença entre rentabilidades: `patrimônio ÷ patrimônio-no-CDI − 1`. O benchmark é real e não decorativo — é a série do Banco Central aplicada aos mesmos aportes, nas mesmas datas.',
    whatItIsFor:
      'Responde "a minha escolha de ativo valeu mais que deixar no CDI?". Dar ao benchmark o MESMO fluxo de caixa é o que torna a comparação honesta: contra um índice cru, quem aportou muito num mês bom parece gênio, e a diferença que sobra aqui é só escolha de ativo. Sem CDI em cache o número não existe e a tela diz "Não medido" — que é diferente de zero, porque empatar com o CDI é resultado, não falta de dado.',
    formula: 'patrimônio ÷ patrimônio-no-CDI − 1',
    example: {
      scenario: 'Carteira em R$ 83.061,84 contra R$ 79.100,00 que os mesmos aportes fariam no CDI:',
      calculation: ['83.061,84 ÷ 79.100,00', '= 1,0501', '= +5,01% acima do CDI'],
    },
  },
  current: {
    title: 'Patrimônio',
    whatItIs: 'Quanto você tem na corretora: os papéis mais o dinheiro parado em caixa.',
    howItIsCalculated:
      'Duas fontes somadas. Os papéis vêm da posição exportada da Área do Investidor da B3 — ações e BDR pelo preço de fechamento, renda fixa pelo valor na curva —, e não são recalculados: é o número que a B3 declara. O caixa vem do extrato da própria corretora, que a B3 não enxerga.',
    whatItIsFor:
      'É o valor de mercado hoje. Repare na data: os papéis valem pelo dia em que você exportou o relatório, não por agora. O caixa entra porque dinheiro vendido e ainda não reaplicado continua sendo seu — sem ele, um mês em que você zerou uma posição apareceria como perda.',
    formula: 'Σ posição da B3 + saldo em caixa da corretora',
    example: {
      scenario: '16 papéis somando R$ 48.200,00 e R$ 37,45 parados em caixa:',
      calculation: ['48.200,00 + 37,45', '= R$ 48.237,45'],
    },
  },
  contributed: {
    title: 'Aportado',
    whatItIs: 'Quanto do seu dinheiro entrou na corretora e ainda não voltou para o banco.',
    howItIsCalculated:
      'Soma dos movimentos entre a corretora e a SUA conta, pelo extrato da corretora: entradas menos saídas. Compra de papel, imposto e provento não contam — eles mexem dinheiro DENTRO da corretora, e somá-los contaria o mesmo real duas vezes.',
    example: {
      scenario: 'R$ 72.500,00 entraram desde 2022 e R$ 30.900,00 voltaram para o banco:',
      calculation: ['72.500,00 − 30.900,00', '= R$ 41.600,00 aportados'],
    },
    whatItIsFor:
      'É a régua contra a qual o patrimônio se compara. Ela sai do extrato da CORRETORA, não do banco, e a diferença não é detalhe: a corretora devolve dinheiro por dois canais, e um deles chega ao banco como uma TED nominal sua, indistinguível de um Pix de outra conta. Medido pelo banco, o aportado saía R$ 12.400,00 alto e o rendimento aparecia negativo.',
    formula: 'Σ entradas vindas do meu banco − Σ saídas para o meu banco',
  },
  gain: {
    title: 'Rendimento',
    whatItIs: 'A diferença entre o que você tem na corretora e o que pôs nela.',
    howItIsCalculated: 'Patrimônio (papéis + caixa) menos o aportado líquido acumulado. Já é líquido de imposto e taxa, porque os dois saem do caixa e o caixa está no patrimônio.',
    whatItIsFor:
      'Responde "valeu a pena?". Ele é confiável desde que as três fontes fechem — e o ingest confere isso: a soma de todo lançamento do extrato da corretora tem de bater com o saldo declarado. Se não bater, o terminal avisa e este número não deve ser lido.',
    formula: 'patrimônio − aportado acumulado',
    example: {
      scenario: 'Patrimônio de R$ 48.237,45 sobre R$ 41.600,00 aportados:',
      calculation: ['48.237,45 − 41.600,00', '= +R$ 6.637,45', '= +16,0% sobre o aportado'],
    },
  },
}
