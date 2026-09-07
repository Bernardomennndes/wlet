import type { PlannedEntry } from '../src/data/types.ts'

/**
 * MODELO — copie para `planned.config.ts` (ignorado pelo git). `pnpm run setup` faz isso.
 *
 * Lançamentos previstos: o que se espera receber e pagar nos meses que ainda não têm
 * extrato. É daqui que sai a previsão nos gráficos — nada é extrapolado do histórico.
 *
 * O que NÃO precisa entrar aqui: parcelas de cartão já compradas. O ingest deriva as que
 * ainda vão ser cobradas a partir do próprio lançamento.
 *
 * Campos: `recurrence` é 'monthly' (com `endMonth` opcional), 'installments' (com `count`)
 * ou 'once'; `exceptions` mapeia mês → valor para o mês que foge do padrão.
 *
 * `dueOn` diz o dia dentro do mês: `{ kind: 'day', day: 25 }` para data fixa, ou
 * `{ kind: 'business-day', nth: 5 }` para o 5º dia útil, resolvido pelo calendário bancário.
 * Vale a pena preencher: é o dia que permite ao mês em curso — o que já tem extrato —
 * mostrar o que ainda vai cair nele, em vez de esperar o mês virar.
 *
 * `match` é opcional e separa as duas naturezas de uma declaração. COM ele, a regra é uma
 * conta com credor conhecido e a tela de Pagamentos pergunta "paguei? atrasou?". SEM ele, é só
 * projeção — que é o certo para um gasto sem credor único, como alimentação: não existe "a
 * conta do mercado", e perguntar se ela foi paga não faz sentido. Esse tipo de gasto vira
 * rubrica em `budget.config.ts`.
 */
export const PLANNED_ENTRIES: PlannedEntry[] = [
  {
    id: 'salario',
    kind: 'income',
    label: 'Salário',
    // Os valores e os nomes casam com o que `scripts/seed.ts` inventa, para o clone novo
    // abrir com as contas conciliadas em vez de nove meses em atraso.
    amount: 10000,
    categoryId: 'receita-pj',
    entity: 'PJ',
    recurrence: 'monthly',
    startMonth: '2026-01',
    dueOn: { kind: 'business-day', nth: 5 },
    match: { merchants: ['CLIENTE FICTICIO LTDA'], accountId: 'inter-pj' },
  },
  {
    id: 'aluguel',
    kind: 'expense',
    label: 'Aluguel',
    amount: 2400,
    categoryId: 'moradia',
    entity: 'PF',
    recurrence: 'monthly',
    startMonth: '2026-01',
    dueOn: { kind: 'day', day: 10 },
    match: { merchants: ['IMOBILIARIA FICTICIA'], accountId: 'xp-conta' },
  },
]
