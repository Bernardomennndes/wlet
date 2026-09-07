import type { Trip } from '../src/data/types.ts'

/**
 * MODELO — copie para `trips.config.ts` (ignorado pelo git). `pnpm run setup` faz isso.
 *
 * As viagens que você fez, com ida e volta. O ingest calcula o que cada uma custou somando os
 * lançamentos da janela — por isso a data é o único dado que você precisa saber.
 */
export const TRIPS: Trip[] = [
  { id: 'sp-2026-02', label: 'São Paulo', from: '2026-02-05', to: '2026-02-08' },
  { id: 'praia-2026-04', label: 'Litoral', from: '2026-04-24', to: '2026-04-26', note: 'Fim de semana' },
]

/**
 * Categorias que NÃO contam como gasto de viagem, mesmo caindo na janela.
 *
 * Aluguel, imposto e assinatura não param porque você viajou. Sem esta lista, um fim de semana
 * fora que cai no dia 24 herda os R$ 1.500 do aluguel e aparece como a viagem mais cara do ano
 * — foi exatamente o que aconteceu na primeira medição.
 */
export const TRIP_EXCLUDED_CATEGORIES: string[] = ['moradia', 'impostos', 'contabilidade', 'assinaturas', 'telefonia', 'tecnologia', 'educacao']
