import type { Overrides } from '@/lib/finance'

/**
 * Os ajustes manuais de categoria: `{ [id da transação]: id da categoria }`.
 *
 * É um contexto próprio, e não um campo de `preferences`, porque é a única coisa guardada no
 * navegador que fala sobre os DADOS e não sobre a forma de olhar para eles. Ele altera o que a
 * Visão geral soma por categoria — `displayCategoryId` o consulta — enquanto tema e recorte
 * não mudam número nenhum.
 */
export interface OverrideRepository {
  findAll(): Promise<Overrides>
  save(overrides: Overrides): Promise<void>
}
