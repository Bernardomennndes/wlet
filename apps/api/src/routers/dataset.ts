import { accounts, datasetBlobs, type Db, eq, sourceFiles, transactions, transfers } from '@wlet/db'
import type { Dataset } from '@wlet/domain'
import { runIngest } from '@wlet/ingest'
import { nodeEnv } from '@wlet/ingest/node-env'
import { os } from '../shared/context'
import { readDeclarations } from '../shared/declarations'
import { money, toMoney } from '../shared/wire'

/**
 * O conjunto ingerido — e o lugar onde o pipeline roda no servidor.
 *
 * É o MESMO `@wlet/ingest` do navegador e do `pnpm ingest`; o que muda é só o `IngestEnv`, que
 * aqui é o de Node. Não existe uma segunda implementação do casamento nem da categorização, e é
 * por isso que o porte para o navegador pôde ser provado comparando dez arquivos byte a byte.
 */
export function datasetRouter(db: Db) {
  const lerConjunto = async (userId: string) => {
    const [contas, txs, tfs, blob] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, userId)),
      db.select().from(transactions).where(eq(transactions.userId, userId)),
      db.select().from(transfers).where(eq(transfers.userId, userId)),
      db
        .select()
        .from(datasetBlobs)
        .where(eq(datasetBlobs.userId, userId))
        .then((r) => r[0]),
    ])
    if (!blob) return null

    return {
      accounts: contas.map((a) => ({
        id: a.id,
        name: a.name,
        bank: a.bank,
        bankCode: a.bankCode,
        type: a.type as 'checking' | 'credit-card' | 'investment',
        entity: a.entity as 'PF' | 'PJ',
        holder: a.holder,
        externalId: a.externalId,
        // `null` explícito e não campo ausente: "conta virtual, sem cobertura" é uma afirmação,
        // e o domínio a declara como `| null`.
        coverage: a.coverageFrom && a.coverageTo ? { from: a.coverageFrom, to: a.coverageTo } : null,
        reportedBalance: (a.reportedBalance as { amount: number; asOf: string } | null) ?? null,
        sources: (a.sources as string[]) ?? [],
        transactionCount: a.transactionCount,
      })),
      // Cast TIPADO e não `as never`: a coluna é jsonb e volta como `unknown`, mas o que foi
      // gravado ali é o `meta` que o pipeline produziu — o mesmo tipo do domínio. `as never`
      // silenciava o objeto inteiro; este assere só o campo que o banco não sabe tipar, e é o
      // mesmo padrão que `reportedBalance` e `sources` usam algumas linhas acima.
      meta: blob.meta as Dataset['meta'],
      // Os nulos são explícitos, e não campos ausentes: no domínio eles são `| null`, e uma
      // ausência diria "não sei" onde o dado diz "não tem".
      transactions: txs.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        entity: t.entity as 'PF' | 'PJ',
        date: t.date,
        postedDate: t.postedDate,
        amount: money(t.amount),
        description: t.description,
        rawDescription: t.rawDescription,
        merchant: t.merchant,
        kind: t.kind as 'statement' | 'invoice',
        categoryId: t.categoryId,
        categoryRule: t.categoryRule,
        installment: t.installmentCurrent && t.installmentTotal ? { current: t.installmentCurrent, total: t.installmentTotal } : null,
        invoice: (t.invoice as { dueDate: string; month: string } | null) ?? null,
        transferId: t.transferId,
        transferKind: t.transferKind as 'internal' | 'card-payment' | 'investment' | 'unmatched-self' | null,
        counterpartAccountId: t.counterpartAccountId,
        receivableId: t.receivableId,
        plannedId: t.plannedId,
        source: t.source,
        fitId: t.fitId,
      })),
      transfers: tfs.map((t) => ({
        id: t.id,
        kind: t.kind as 'internal' | 'card-payment' | 'investment',
        date: t.date,
        amount: money(t.amount),
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        fromTransactionId: t.fromTransactionId,
        toTransactionId: t.toTransactionId,
        description: t.description,
      })),
      // Mesmo caso do `meta`: a coluna é jsonb e volta `unknown`. O contrato declara os três
      // campos como `z.unknown()` (shape.ts:65-69), então o tipo do domínio assina sem estreitar
      // nada — o que o cast faz é dizer de ONDE o valor veio, em vez de calar o objeto inteiro.
      investments: blob.investments as Dataset['investments'],
    }
  }

  /**
   * Roda o pipeline e publica o resultado.
   *
   * A publicação é numa TRANSAÇÃO e o conjunto anterior só cai depois do novo ser aceito: meio
   * conjunto gravado é pior que nenhum, e um erro no meio deixaria a pessoa sem extrato nenhum.
   * É a mesma garantia que o `dbReplaceAll` dá no navegador, com o mesmo motivo.
   */
  const publicar = async (userId: string, arquivos: { path: string; bytes: Uint8Array }[]) => {
    const config = await readDeclarations(db, userId)
    const resultado = await runIngest({ sources: arquivos, ...config, now: new Date().toISOString(), env: nodeEnv })

    await db.transaction(async (tx) => {
      await tx.delete(transactions).where(eq(transactions.userId, userId))
      await tx.delete(transfers).where(eq(transfers.userId, userId))
      await tx.delete(accounts).where(eq(accounts.userId, userId))

      if (resultado.accounts.length) {
        await tx.insert(accounts).values(
          resultado.accounts.map((a) => ({
            userId,
            id: a.id,
            name: a.name,
            bank: a.bank,
            bankCode: a.bankCode,
            entity: a.entity,
            type: a.type,
            holder: a.holder,
            externalId: a.externalId,
            transactionCount: a.transactionCount,
            coverageFrom: a.coverage?.from ?? null,
            coverageTo: a.coverage?.to ?? null,
            reportedBalance: a.reportedBalance ?? null,
            sources: a.sources ?? [],
          })),
        )
      }
      if (resultado.transactions.length) {
        // Em lotes: um `insert` de 5.694 linhas estoura o limite de parâmetros do Postgres
        // (65535), e o sintoma seria um erro só com dado real — nunca em desenvolvimento.
        const lote = 500
        for (let i = 0; i < resultado.transactions.length; i += lote) {
          await tx.insert(transactions).values(
            resultado.transactions.slice(i, i + lote).map((t) => ({
              userId,
              id: t.id,
              accountId: t.accountId,
              date: t.date,
              amount: toMoney(t.amount),
              description: t.description,
              rawDescription: t.rawDescription,
              merchant: t.merchant,
              categoryId: t.categoryId,
              entity: t.entity,
              postedDate: t.postedDate,
              kind: t.kind,
              categoryRule: t.categoryRule,
              installmentCurrent: t.installment?.current ?? null,
              installmentTotal: t.installment?.total ?? null,
              invoice: t.invoice,
              transferKind: t.transferKind,
              counterpartAccountId: t.counterpartAccountId,
              transferId: t.transferId,
              plannedId: t.plannedId,
              receivableId: t.receivableId,
              source: t.source,
              fitId: t.fitId,
            })),
          )
        }
      }
      if (resultado.transfers.length) {
        await tx.insert(transfers).values(
          resultado.transfers.map((t) => ({
            userId,
            id: t.id,
            kind: t.kind,
            fromAccountId: t.fromAccountId,
            toAccountId: t.toAccountId,
            fromTransactionId: t.fromTransactionId,
            toTransactionId: t.toTransactionId,
            description: t.description,
            amount: toMoney(t.amount),
            date: t.date,
          })),
        )
      }
      await tx
        .insert(datasetBlobs)
        .values({ userId, meta: resultado.meta, investments: resultado.investments })
        .onConflictDoUpdate({ target: datasetBlobs.userId, set: { meta: resultado.meta, investments: resultado.investments, updatedAt: new Date() } })
    })

    return { dataset: (await lerConjunto(userId))!, report: resultado.report }
  }

  return {
    get: os.dataset.get.handler(({ context }) => lerConjunto(context.userId)),

    ingest: os.dataset.ingest.handler(async ({ context, input }) => {
      const arquivos = input.sources.map((s) => ({ path: s.path, bytes: new Uint8Array(Buffer.from(s.contentBase64, 'base64')) }))
      // Os arquivos são guardados ANTES de rodar, e a pasta nova SUBSTITUI a anterior: um
      // extrato que a pessoa apagou não pode continuar produzindo lançamentos.
      await db.transaction(async (tx) => {
        await tx.delete(sourceFiles).where(eq(sourceFiles.userId, context.userId))
        if (input.sources.length) {
          await tx.insert(sourceFiles).values(input.sources.map((s) => ({ userId: context.userId, path: s.path, content: s.contentBase64, bytes: Buffer.from(s.contentBase64, 'base64').length })))
        }
      })
      return publicar(context.userId, arquivos)
    }),

    reingest: os.dataset.reingest.handler(async ({ context }) => {
      const guardados = await db.select().from(sourceFiles).where(eq(sourceFiles.userId, context.userId))
      if (!guardados.length) throw new Error('NoSourcesError')
      return publicar(
        context.userId,
        guardados.map((f) => ({ path: f.path, bytes: new Uint8Array(Buffer.from(f.content, 'base64')) })),
      )
    }),

    reset: os.dataset.reset.handler(async ({ context }) => {
      await db.transaction(async (tx) => {
        for (const t of [transactions, transfers, accounts, sourceFiles]) await tx.delete(t).where(eq(t.userId, context.userId))
        await tx.delete(datasetBlobs).where(eq(datasetBlobs.userId, context.userId))
      })
      return { ok: true as const }
    }),

    sources: os.dataset.sources.handler(async ({ context }) => {
      const rows = await db.select().from(sourceFiles).where(eq(sourceFiles.userId, context.userId))
      return rows.map((f) => ({ path: f.path, bytes: f.bytes, uploadedAt: f.uploadedAt.toISOString() }))
    }),
  }
}
