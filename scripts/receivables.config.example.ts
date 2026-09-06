import type { Receivable } from '../src/data/types.ts'

/**
 * MODELO — copie para `receivables.config.ts` (ignorado pelo git). `pnpm setup` faz isso.
 *
 * Cobranças: o que alguém te deve, e a despesa que o recebimento abate.
 *
 * O caso que originou isto: você paga o aluguel inteiro e divide com quem mora junto. A
 * saída de R$ 1.500 é sua, mas metade do dinheiro que volta NÃO é receita — é o rateio de
 * uma despesa que você adiantou. Declarada aqui, essa entrada deixa de contar como entrada e
 * passa a abater `offsetsCategoryId`, então a moradia do mês mostra o custo real.
 *
 * Quem diz se foi paga é o extrato. O ingest procura, dentro do mês, uma entrada na conta
 * `match.accountId` cuja contraparte case com um dos `match.merchants` — e marca a transação. Não há botão
 * de "recebido": sem banco, essa marcação viveria no navegador, e o extrato é melhor juiz.
 *
 * **O casamento é por CONTRAPARTE, nunca por valor.** O rateio varia mês a mês, e valores
 * iguais vindos de origens diferentes se confundiriam. `amount` é a referência que produz a
 * diferença exibida ("recebido 480,00 de 700,00"), não o critério.
 *
 * `match.merchants` vai em MAIÚSCULAS e sem acento — é assim que o ingest normaliza o nome
 * antes de comparar. É uma lista porque quem deve e quem paga nem sempre coincidem: se a mãe
 * quita pelo filho em alguns meses, os dois nomes entram na MESMA cobrança. Duas cobranças
 * partiriam o histórico de uma dívida só, e o mês pago pelo outro viraria atraso.
 *
 * `match.amountBetween` é a exceção ao "casa qualquer valor": use quando o MESMO pagador quita
 * coisas diferentes — o mesmo pagador que quita as parcelas da viagem e também devolve a conta de
 * telefone. Um piso separa as duas sem precisar de duas cobranças.
 *
 * Recorrência `installments` é UMA dívida em N parcelas: o que entra abate a próxima em
 * aberto, então pagar adiantado não deixa o mês seguinte em atraso. `monthly` é o contrário —
 * cada mês é uma obrigação própria, e sobra de um mês não cobre o outro.
 *
 * Depois de editar, rode `pnpm ingest`: o relatório diz quantos meses da janela casaram e
 * quais ficaram sem contraparte.
 */
export const RECEIVABLES: Receivable[] = [
  {
    id: 'rateio-aluguel',
    debtor: 'Colega de Apartamento',
    label: 'Metade do aluguel',
    // Nome e valor casam com o que `scripts/seed.ts` inventa: um clone novo abre com a
    // cobrança conciliada, e não com oito meses em atraso num conjunto que sempre pagou. O
    // primeiro mês da janela aparece em atraso de propósito — a regra começa antes do dado, e
    // é o jeito de a tela demonstrar o estado sem inventar um calote.
    amount: 1200,
    dueOn: { kind: 'day', day: 15 },
    recurrence: 'monthly',
    startMonth: '2026-01',
    match: { merchants: ['COLEGA DE APARTAMENTO'], accountId: 'xp-conta' },
    offsetsCategoryId: 'moradia',
  },
]
