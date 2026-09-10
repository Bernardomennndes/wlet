import { createDb, eq, settings } from '@wlet/db'
import { os } from '../shared/context'

/**
 * As preferências vivem numa coluna JSONB de `settings`.
 *
 * Não é preguiça: são três campos que só se leem juntos e nunca se consultam por valor — não
 * existe "quem escolheu tema escuro". Uma tabela pagaria três colunas e uma junção para nunca
 * filtrar por nenhuma delas.
 */
export function preferencesRouter(db: ReturnType<typeof createDb>) {
  const vazio = { scope: null, period: null, theme: null }

  return {
    get: os.preferences.get.handler(async ({ context }) => {
      const [row] = await db.select({ preferences: settings.preferences }).from(settings).where(eq(settings.userId, context.userId))
      // Mesclado com o VAZIO, e não devolvido cru: a linha pode existir com `{}` — é assim que
      // ela nasce quando a configuração é gravada antes de qualquer preferência —, e um `{}`
      // não tem os três campos que o contrato exige. A validação de saída pegou isto.
      return { ...vazio, ...((row?.preferences as Partial<typeof vazio>) ?? {}) }
    }),

    set: os.preferences.set.handler(async ({ context, input }) => {
      const [row] = await db.select({ preferences: settings.preferences }).from(settings).where(eq(settings.userId, context.userId))
      // O PATCH é parcial de propósito: mexer no tema não pode apagar o período que a pessoa
      // escolheu, e mandar o agregado inteiro do cliente abriria essa janela.
      const next = { ...vazio, ...(row?.preferences as object), ...input }
      await db
        .insert(settings)
        .values({ userId: context.userId, preferences: next, budget: {}, accountProfiles: [], rules: [], selfNamePatterns: [] })
        .onConflictDoUpdate({ target: settings.userId, set: { preferences: next } })
      return next as typeof vazio
    }),
  }
}
