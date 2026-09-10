import type { PlansData } from '@wlet/domain/plans'

/**
 * O contrato de persistência do catálogo de planos.
 *
 * Repare que ele fala em PLANO, não em chave e valor (§6 da rule): quem lê esta interface não
 * descobre se por baixo há `localStorage`, IndexedDB ou um arquivo. Um port que expusesse
 * `getItem` seria o adapter vazando para cima, e a escolha da §7 deixaria de ser trocável.
 *
 * O agregado é o catálogo INTEIRO (`PlansData`: grupos + itens), não um plano por vez. É o que
 * a §3 exige de um contexto de `localStorage`: sem transação, a única escrita segura é a do
 * envelope completo de uma vez.
 */
export interface PlanRepository {
  findAll(): Promise<PlansData>
  save(data: PlansData): Promise<void>
}

/**
 * De onde vêm os ids novos.
 *
 * É porta, e não import direto de `planId`, por causa da §9: `planId` usa `Date.now()` e
 * `Math.random()`, e um teste que não controla o id não consegue afirmar nada sobre o que foi
 * gravado. O relógio e o acaso entram pela porta; o adapter de produção os traz de volta.
 */
export interface IdGenerator {
  next(prefix: string): string
}
