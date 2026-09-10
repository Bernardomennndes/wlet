import { oc } from '@orpc/contract'
import { declarations } from './shape'

/**
 * A configuração declarada — o que o ingest lê para identificar, categorizar, projetar e cobrar.
 *
 * A escrita é do AGREGADO INTEIRO e não de uma parte: a validação é do conjunto (ids repetidos,
 * regra parcelada sem contagem), e gravar em pedaços abriria a janela para um estado que nenhuma
 * das partes sozinha recusa. É a §3 da arquitetura de serviços — um agregado, uma escrita.
 */
export const configRoutes = {
  get: oc.route({ method: 'GET', path: '/config' }).output(declarations),
  replace: oc.route({ method: 'PUT', path: '/config' }).input(declarations).output(declarations),
}
