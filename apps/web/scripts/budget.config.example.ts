import type { Budget } from '@wlet/domain'

/**
 * MODELO — copie para `budget.config.ts` (ignorado pelo git). `pnpm run setup` faz isso.
 *
 * Teto de gastos do mês. Vale para o mês corrente no recorte selecionado, e é comparado com
 * as saídas medidas — transferência entre contas próprias não conta, porque não é gasto.
 */
export const BUDGET: Budget = {
  monthlyLimit: 5000,
  /** A partir desta fração do teto o cartão avisa; acima de 100% ele alerta. */
  warnAt: 0.75,
  /**
   * Rubricas: o gasto esperado por categoria, com duas leituras num número só — teto no mês
   * em curso, previsão nos meses futuros.
   *
   * Aqui entra o gasto SEM credor único. Alimentação não é uma conta: não existe "a conta do
   * mercado", e perguntar se ela foi paga não faz sentido. Uma conta com credor conhecido
   * (aluguel, mensalidade) vai para `planned.config.ts` com `match`, e aí sim ganha situação
   * de pagamento.
   *
   * A projeção é PISO, não soma: se a categoria já tem parcela de cartão contratada ou conta
   * declarada naquele mês, a rubrica projeta só a diferença — senão o mesmo gasto entraria
   * duas vezes.
   *
   * Uma rubrica pode ser um número digitado OU uma composição de itens, e aí o valor é a soma
   * deles (`quantity` × `unitAmount`) — o `amount` deixa de ser lido. Serve para o gasto que
   * você conhece item a item: dieta, suplementação, ração. O ganho não é precisão, é MEMÓRIA:
   * daqui a três meses o total continua dizendo de onde saiu, e quando o preço de um item
   * subir você sabe exatamente quanto mexer.
   */
  byCategory: [
    { categoryId: 'mercado', amount: 900 },
    {
      categoryId: 'suplementacao',
      // Ignorado, porque há composição: quem manda é a soma dos itens.
      amount: 0,
      items: [
        { label: 'Whey 900 g', quantity: 2, unitAmount: 180 },
        { label: 'Creatina 300 g', quantity: 1, unitAmount: 120 },
      ],
    },
    { categoryId: 'restaurantes', amount: 600 },
    { categoryId: 'transporte', amount: 300 },
  ],
}
