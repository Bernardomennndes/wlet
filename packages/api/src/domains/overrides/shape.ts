import { z } from 'zod'

/**
 * A origem NÃO publica schema nomeado: quem serve estas rotas é o `apps/api` desta mesma
 * árvore, e o mapa abaixo é montado no handler a partir do Drizzle. O nome é nosso, e a junção
 * é a do compilador — `os.router(...)` em `apps/api/src/main.ts` quebra em compilação se a
 * forma mudar aqui.
 */

/**
 * A chave é o id DETERMINÍSTICO que o ingest calcula: `sha1` de sete campos, cortado em DOZE
 * hexadecimais (`@wlet/ingest`, `sha1.ts`). O espaço de chave é exato e a regra é declará-lo na
 * forma que o servidor emite — `z.string()` cru aceita `'abc'`, que grava um ajuste órfão que
 * nenhuma transação jamais reivindica. A tabela `overrides` não tem chave estrangeira de
 * propósito (o ajuste sobrevive a uma reingestão), então nada mais recusaria a chave inventada.
 */
export const transactionId = z.string().regex(/^[0-9a-f]{12}$/)

/**
 * Os ajustes manuais: id de transação → id de categoria.
 *
 * Um MAPA e não uma lista porque é assim que se lê — a tela pergunta "esta transação tem
 * ajuste?" uma vez por linha, e uma lista pagaria uma varredura por pergunta.
 *
 * A chave aqui é `z.string()`, e NÃO o `transactionId` acertado: apertar a entrada é restrição
 * nossa sobre o que aceitamos gravar; apertar a saída faria um único ajuste órfão já gravado
 * derrubar a RESPOSTA INTEIRA, e a pessoa perderia todos os outros por causa dele.
 */
export const overridesMap = z.record(z.string(), z.string())
