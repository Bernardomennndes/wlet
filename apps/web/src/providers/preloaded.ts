import type { Overrides } from '@/lib/finance'
import { emptyPlans, type PlansData } from '@wlet/domain/plans'
import type { DatasetOrigin } from '@wlet/services/dataset'
import type { Preferences } from '@wlet/services/preferences'

/**
 * O que o boot já carregou para os providers lerem SÍNCRONO.
 *
 * Mesmo problema do dataset, mesma solução. `FiltersProvider` e `ThemeProvider` leem o estado
 * gravado dentro do inicializador de `useState`, que é síncrono por definição; os serviços são
 * assíncronos porque todos falam com o servidor. Transformar os providers em assíncronos
 * significaria um estado de carregamento em toda tela e, no caso do tema, um flash de tela
 * clara antes de saber que a pessoa escolheu escuro.
 *
 * Então o portão de boot carrega, este módulo guarda, e o provider lê. As ESCRITAS continuam
 * indo pelos serviços, que é onde a validação e a tradução de erro moram.
 *
 * Fica em `src/providers/` e não em `src/lib/` de propósito: ele conhece o tipo `Preferences`,
 * que é de um serviço, e `src/lib/` é o kernel que os serviços consomem — a seta aponta para
 * um lado só.
 */
export interface Preloaded {
  preferences: Preferences
  overrides: Overrides
  plans: PlansData
  /**
   * De onde o conjunto veio neste boot.
   *
   * Ia só para o `console.info`, e ali ela não serve a quem precisa: quando um número parece
   * errado, a primeira pergunta é "estes dados são os meus ou a cópia que veio no app?". A
   * tela de Dados responde isso.
   */
  datasetOrigin: DatasetOrigin
}

let current: Preloaded | null = null

export function setPreloaded(next: Preloaded): void {
  current = next
}

/**
 * Devolve o que o boot carregou, ou o vazio.
 *
 * Ao contrário de `dataset()`, este NÃO lança quando falta. A diferença é o que a ausência
 * significa: sem dataset o app não tem o que desenhar, mas sem preferência gravada ele abre
 * exatamente como abre para quem nunca usou — no recorte consolidado, no período padrão e no
 * tema do sistema. Um app que se recusa a abrir porque ninguém escolheu um tema seria pior do
 * que um que escolhe por você desta vez.
 */
export function preloaded(): Preloaded {
  return current ?? { preferences: { scope: null, period: null, theme: null }, overrides: {}, plans: emptyPlans(), datasetOrigin: 'seed' }
}
