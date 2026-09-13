import { newId } from '@wlet/domain'
import type { IdGenerator } from '../domain/ports/plan-repository'

/**
 * Os ids de produção, vindos do relógio e do acaso.
 *
 * É infraestrutura porque é justamente isso que a porta isola (§9): `Date.now()` e `Math.random()`
 * são o mundo de fora, e um teste que não os controla não consegue afirmar nada sobre o que foi
 * gravado. O fake sequencial de `test-support/` cumpre a MESMA interface (§6).
 *
 * **A implementação não é escrita aqui, é DELEGADA a `newId`** (§10). A montagem da aplicação
 * tinha um literal próprio — `plan-${Date.now().toString(36)}` — que ignorava o `newId` que
 * `@wlet/domain` já oferecia, e ao reescrevê-lo perdeu o sufixo aleatório. Medido: 200 chamadas
 * no mesmo tique davam 1 id distinto e 199 colisões, contra 200 distintos com `newId`. Dois
 * planos com o mesmo id não estouram nada — `updatePlan` edita os dois e `removePlan` apaga os
 * dois, em silêncio. Pela tela a colisão é difícil de alcançar, porque cada criação espera o
 * servidor; a primeira coisa que criar planos em laço a alcança inteira.
 */
export function makePlanIdGenerator(): IdGenerator {
  return { next: (prefix) => newId(prefix) }
}
