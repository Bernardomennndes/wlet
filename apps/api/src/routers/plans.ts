import { and, createDb, eq, planGroups, plans } from '@wlet/db'
import { os } from '../shared/context'
import { money, toMoney } from '../shared/wire'

type Row = typeof plans.$inferSelect

/**
 * Do banco para o fio: os dois preços voltam a ser número, e `financed` some quando não há.
 *
 * `financed` exige as DUAS colunas, e não só o total. Elas são independentes e nuláveis no
 * schema, e a versão anterior completava a que faltasse com `?? 2` — uma compra em 10× voltava
 * como 2×, e a previsão de fluxo consome esse número. Um preço parcelado sem número de parcelas
 * não significa nada no domínio (é o que o docblock do contrato diz, com o exemplo do "R$ 3.400
 * em 10×"), então omiti-lo é a leitura honesta: o dado continua na linha, e a tela não mostra um
 * parcelamento que ninguém escreveu.
 */
function toPlan(r: Row) {
  return {
    id: r.id,
    label: r.label,
    categoryId: r.categoryId,
    cash: money(r.cash),
    ...(r.financedTotal !== null && r.financedInstallments !== null ? { financed: { total: money(r.financedTotal), installments: Number(r.financedInstallments) } } : {}),
    ...(r.payment ? { payment: r.payment as 'cash' | 'financed' } : {}),
    ...(r.month ? { month: r.month } : {}),
    ...(r.groupId ? { groupId: r.groupId } : {}),
    status: r.status as 'decided' | 'considering' | 'discarded',
  }
}

export function plansRouter(db: ReturnType<typeof createDb>) {
  const listPlans = async (userId: string) => {
    const [groups, items] = await Promise.all([db.select().from(planGroups).where(eq(planGroups.userId, userId)), db.select().from(plans).where(eq(plans.userId, userId))])
    return { groups: groups.map((g) => ({ id: g.id, label: g.label })), items: items.map(toPlan) }
  }

  const values = (userId: string, id: string, p: Partial<ReturnType<typeof toPlan>>) => ({
    userId,
    id,
    label: p.label ?? '',
    categoryId: p.categoryId ?? 'outros',
    cash: toMoney(p.cash ?? 0),
    financedTotal: p.financed ? toMoney(p.financed.total) : null,
    financedInstallments: p.financed ? String(p.financed.installments) : null,
    payment: p.payment ?? null,
    month: p.month ?? null,
    groupId: p.groupId ?? null,
    status: p.status ?? 'considering',
  })

  return {
    list: os.plans.list.handler(({ context }) => listPlans(context.userId)),

    add: os.plans.add.handler(async ({ context, input }) => {
      await db.insert(plans).values(values(context.userId, `plan-${Date.now().toString(36)}`, input))
      return listPlans(context.userId)
    }),

    update: os.plans.update.handler(async ({ context, input }) => {
      const [current] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      if (!current) return listPlans(context.userId)
      // O patch é aplicado sobre o que ESTÁ gravado, não sobre o que o cliente acha que está:
      // duas edições seguidas na mesma linha não podem uma desfazer a outra.
      await db
        .update(plans)
        .set(values(context.userId, input.id, { ...toPlan(current), ...input.patch }))
        .where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      return listPlans(context.userId)
    }),

    remove: os.plans.remove.handler(async ({ context, input }) => {
      await db.delete(plans).where(and(eq(plans.userId, context.userId), eq(plans.id, input.id)))
      return listPlans(context.userId)
    }),

    addGroup: os.plans.addGroup.handler(async ({ context, input }) => {
      await db.insert(planGroups).values({ userId: context.userId, id: `group-${Date.now().toString(36)}`, label: input.label })
      return listPlans(context.userId)
    }),

    removeGroup: os.plans.removeGroup.handler(async ({ context, input }) => {
      // Apagar o grupo NÃO apaga os planos dele: eles perdem o grupo e continuam na lista. É a
      // regra que o serviço do navegador já tinha, e ela vale igual aqui.
      await db
        .update(plans)
        .set({ groupId: null })
        .where(and(eq(plans.userId, context.userId), eq(plans.groupId, input.id)))
      await db.delete(planGroups).where(and(eq(planGroups.userId, context.userId), eq(planGroups.id, input.id)))
      return listPlans(context.userId)
    }),

    replaceAll: os.plans.replaceAll.handler(async ({ context, input }) => {
      // Substituição inteira é o caminho da importação de um pacote. Numa transação: metade
      // gravada é pior que nada gravado.
      await db.transaction(async (tx) => {
        await tx.delete(plans).where(eq(plans.userId, context.userId))
        await tx.delete(planGroups).where(eq(planGroups.userId, context.userId))
        if (input.groups.length) await tx.insert(planGroups).values(input.groups.map((g) => ({ userId: context.userId, id: g.id, label: g.label })))
        if (input.items.length) await tx.insert(plans).values(input.items.map((p) => values(context.userId, p.id, p)))
      })
      return listPlans(context.userId)
    }),
  }
}
