import { configRoutes } from '../domains/config/routes'
import { datasetRoutes } from '../domains/dataset/routes'
import { overridesRoutes } from '../domains/overrides/routes'
import { plansRoutes } from '../domains/plans/routes'
import { preferencesRoutes } from '../domains/preferences/routes'

/**
 * O contrato do WLET — um domínio por contexto de serviço.
 *
 * Ele é o ÚNICO lugar onde a forma do fio é declarada, e servidor e cliente o consomem: o
 * `apps/api` implementa este objeto com `@orpc/server`, e o app o consome com `@orpc/client`.
 * Um campo que muda aqui quebra os dois em tempo de compilação — que é precisamente o ganho de
 * ser contract-first, e a razão de não haver um "tipo de resposta" escrito à mão de cada lado.
 */
export const wletContract = {
  dataset: datasetRoutes,
  config: configRoutes,
  plans: plansRoutes,
  overrides: overridesRoutes,
  preferences: preferencesRoutes,
}

export type WletContract = typeof wletContract
