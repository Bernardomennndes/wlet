import { fromJson, toJson } from '@/lib/portable'
import type { Declarations } from '@/lib/ingest/pipeline'
import { parsePlans, type PlansData } from '@/lib/plans'
import type { Overrides } from '@/lib/finance'
import type { Preferences } from './preferences'
import { services, type Services } from './index'

/**
 * A cópia de segurança do que só existe neste navegador.
 *
 * Mora no composition root e não num contexto próprio porque atravessa os cinco, e a §4 diz
 * como isso se faz: pela API pública de cada um, nunca pelas entranhas. Um "contexto de
 * backup" com armazenamento nenhum seria uma pasta a mais para dizer a mesma coisa.
 *
 * **O que entra, e o que NÃO entra.** Entram as declarações, os planos, os ajustes manuais de
 * categoria e a preferência de visualização — tudo que a pessoa digitou e que nada regenera.
 * NÃO entra o conjunto de transações: ele é derivado dos arquivos, os arquivos estão guardados
 * no navegador, e a pessoa tem os originais no banco de onde os exportou. Pôr 4 MB de
 * lançamentos num arquivo que existe para ser guardado em outro lugar aumentaria o risco de
 * vazamento sem reduzir o de perda — é o único dado aqui que se reconstrói sozinho.
 */
export interface BackupPayload extends Record<string, unknown> {
  declarations: Declarations
  plans: PlansData
  overrides: Overrides
  preferences: Preferences
}

/**
 * Os serviços entram por PARÂMETRO, com o singleton como padrão.
 *
 * Sem isso este módulo só rodaria num navegador — `services()` monta adapters de IndexedDB ao
 * ser chamado —, e ida-e-volta de backup é exatamente o tipo de coisa que precisa de teste: a
 * falha aqui é perda de dado, e ela é silenciosa (§9 da rule de serviços).
 */
export async function exportState(deps: Services = services()): Promise<string> {
  const { config, plans, overrides, preferences } = deps
  const [declarations, catalogue, adjustments, prefs] = await Promise.all([config.load(), plans.list(), overrides.list(), preferences.load()])
  return toJson({ declarations, plans: catalogue, overrides: adjustments, preferences: prefs } satisfies BackupPayload)
}

/** O que a importação de fato restaurou. A tela mostra isto: importar em silêncio esconde um arquivo pela metade. */
export interface ImportSummary {
  declarations: boolean
  plans: number
  overrides: number
  preferences: boolean
}

/**
 * Restaura um arquivo exportado. Devolve `null` quando o arquivo não é deste app.
 *
 * Cada parte é restaurada de forma INDEPENDENTE: um arquivo antigo que só tem planos ainda
 * restaura os planos. Recusar o arquivo inteiro por causa de uma parte ausente transformaria
 * uma cópia parcial em nenhuma cópia.
 */
export async function importState(text: string, deps: Services = services()): Promise<ImportSummary | null> {
  const payload = fromJson(text)
  if (!payload) return null

  const { config, plans, overrides, preferences } = deps
  const summary: ImportSummary = { declarations: false, plans: 0, overrides: 0, preferences: false }
  const p = payload as Partial<BackupPayload>

  if (p.declarations && typeof p.declarations === 'object') {
    // Passa pelo serviço, então a validação de sempre vale — um arquivo editado à mão não
    // entra sem conferência só por vir de um export.
    await config.replace(p.declarations)
    summary.declarations = true
  }
  if (p.plans) {
    // `parsePlans` é o MESMO parser da leitura do armazenamento: descarta item inválido em
    // silêncio e converte a versão 1. Uma segunda validação divergiria dele (§10).
    const parsed = parsePlans(p.plans)
    await plans.replaceAll(parsed)
    summary.plans = parsed.items.length
  }
  if (p.overrides && typeof p.overrides === 'object') {
    for (const [id, categoryId] of Object.entries(p.overrides)) {
      if (typeof categoryId === 'string') {
        await overrides.set(id, categoryId)
        summary.overrides += 1
      }
    }
  }
  if (p.preferences && typeof p.preferences === 'object') {
    const prefs = p.preferences
    if (prefs.scope) await preferences.setScope(prefs.scope)
    if (prefs.period) await preferences.setPeriod(prefs.period)
    if (prefs.theme) await preferences.setTheme(prefs.theme)
    summary.preferences = true
  }
  return summary
}
