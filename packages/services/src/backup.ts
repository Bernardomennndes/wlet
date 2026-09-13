import type { Overrides } from '@wlet/domain'
import type { Dataset } from '@wlet/domain'
import type { Declarations } from '@wlet/ingest/pipeline'
import type { SourceFile } from '@wlet/ingest/io'
import { parsePlans, type PlansData } from '@wlet/domain/plans'
import { fromBase64, fromJson, toBase64, toJson } from '@wlet/lib/portable'
import type { Preferences } from './preferences'

/**
 * O pacote: TUDO que existe neste navegador, num arquivo.
 *
 * Mora no composition root e não num contexto próprio porque atravessa os cinco, e a §4 diz
 * como isso se faz: pela API pública de cada um, nunca pelas entranhas. Um "contexto de
 * backup" com armazenamento nenhum seria uma pasta a mais para dizer a mesma coisa.
 *
 * **O conjunto e os arquivos-fonte entram, e isso mudou de opinião.** A versão anterior os
 * excluía com um argumento que valia enquanto o pacote servia só de cópia de segurança: os
 * lançamentos se refazem dos arquivos, então guardá-los aumentaria a superfície sem reduzir o
 * risco. O pacote passou a servir também para TRANSPORTAR — gerar no terminal, onde o
 * pipeline pode ser conferido contra os arquivos reais, e inserir no navegador. Para isso o
 * conjunto tem de viajar, e os arquivos junto, senão o destino não consegue reprocessar.
 *
 * **O tamanho está medido e é o esperado:** 3,3 MB de conjunto e 15,1 MB dos arquivos em
 * base64 — os +33% de base64 sobre 11,4 MB de PDF e xlsx, que já chegam comprimidos e não
 * encolhem de novo. O arquivo sai MINIFICADO: 18 MB não vão ser lidos a olho, e a indentação
 * custaria mais de um MB para nada.
 */
export const PACKAGE_PARTS = ['dataset', 'declarations', 'plans', 'overrides', 'preferences', 'sources'] as const
export type PackagePart = (typeof PACKAGE_PARTS)[number]

interface StoredSource {
  path: string
  base64: string
}

export interface BackupPayload extends Record<string, unknown> {
  dataset: Dataset
  declarations: Declarations
  plans: PlansData
  overrides: Overrides
  preferences: Preferences
  sources: StoredSource[]
}

import type { ConfigService } from './config'
import type { DatasetService } from './dataset'
import type { OverridesService } from './overrides'
import type { PlansService } from './plans'
import type { PreferencesService } from './preferences'

/**
 * Os serviços de que o pacote precisa — recebidos, não montados.
 *
 * Antes ele chamava a fábrica `services()` como padrão do parâmetro, e isso o amarrava ao
 * composition root do APP. Recebendo-os, o mesmo backup serve o servidor, onde os adapters são
 * outros e a fábrica não existe.
 */
export interface BackupDeps {
  dataset: DatasetService
  config: ConfigService
  plans: PlansService
  overrides: OverridesService
  preferences: PreferencesService
}

export async function exportState(deps: BackupDeps): Promise<string> {
  const { dataset, config, plans, overrides, preferences } = deps
  const [loaded, declarations, catalog, adjustments, prefs, sources] = await Promise.all([dataset.load(), config.load(), plans.list(), overrides.list(), preferences.load(), dataset.readSources()])
  const payload: BackupPayload = {
    dataset: loaded.data,
    declarations,
    plans: catalog,
    overrides: adjustments,
    preferences: prefs,
    sources: sources.map((s) => ({ path: s.path, base64: toBase64(s.bytes) })),
  }
  return toJson(payload, true)
}

/** O que um arquivo CONTÉM — é isto que o diálogo de importação desenha antes de escrever nada. */
export interface PackageContents {
  dataset: { transactions: number; accounts: number } | null
  declarations: { planned: number; receivables: number; goals: number; rules: number; accounts: number } | null
  plans: number | null
  overrides: number | null
  preferences: boolean
  sources: number | null
}

/**
 * Lê o arquivo e diz o que há dentro, sem gravar nada.
 *
 * A inspeção é separada da escrita de propósito: o diálogo precisa mostrar o que vai
 * substituir ANTES de substituir, e "importar e ver no que dá" é o oposto disso num app cujo
 * armazenamento é a única cópia.
 */
export function inspectPackage(text: string): { contents: PackageContents; payload: Partial<BackupPayload> } | null {
  const raw = fromJson(text)
  if (!raw) return null
  const p = raw as Partial<BackupPayload>
  return {
    payload: p,
    contents: {
      dataset: p.dataset?.transactions ? { transactions: p.dataset.transactions.length, accounts: p.dataset.accounts?.length ?? 0 } : null,
      declarations: p.declarations
        ? {
            planned: p.declarations.planned?.length ?? 0,
            receivables: p.declarations.receivables?.length ?? 0,
            goals: p.declarations.goals?.length ?? 0,
            rules: p.declarations.rules?.length ?? 0,
            accounts: p.declarations.accounts?.length ?? 0,
          }
        : null,
      plans: p.plans?.items ? p.plans.items.length : null,
      overrides: p.overrides ? Object.keys(p.overrides).length : null,
      preferences: Boolean(p.preferences),
      sources: p.sources ? p.sources.length : null,
    },
  }
}

export interface ImportSummary {
  imported: PackagePart[]
  overrides: number
}

/**
 * Grava as partes ESCOLHIDAS. Cada uma substitui, nenhuma mescla.
 *
 * Mesclar dois conjuntos não tem regra de desempate que não seja arbitrária — o mesmo
 * lançamento vindo de dois pacotes teria de escolher um, e qualquer critério inventado aqui
 * mentiria sobre a origem do número.
 *
 * A ORDEM importa: as declarações vão antes do conjunto porque o id de cada transação embute o
 * `profile.id` do perfil de conta. Importar o conjunto sem as declarações que o geraram deixa
 * os dois em desacordo, e um reprocessamento posterior mudaria todo id — apagando os ajustes
 * manuais de categoria em silêncio. O diálogo avisa; aqui a ordem garante o caso em que os
 * dois foram escolhidos.
 */
export async function importState(payload: Partial<BackupPayload>, parts: readonly PackagePart[], deps: BackupDeps): Promise<ImportSummary> {
  const { dataset, config, plans, overrides, preferences } = deps
  const want = new Set(parts)
  const summary: ImportSummary = { imported: [], overrides: 0 }

  if (want.has('declarations') && payload.declarations) {
    // Passa pelo serviço, então a validação de sempre vale — vir de um export não torna um
    // arquivo confiável, porque ele pode ter sido editado entre uma coisa e outra.
    await config.replace(payload.declarations)
    summary.imported.push('declarations')
  }
  if (want.has('dataset') && payload.dataset) {
    await dataset.replace(payload.dataset)
    summary.imported.push('dataset')
  }
  if (want.has('sources') && payload.sources) {
    const files: SourceFile[] = payload.sources.map((s) => ({ path: s.path, bytes: fromBase64(s.base64) }))
    await dataset.writeSources(files)
    summary.imported.push('sources')
  }
  if (want.has('plans') && payload.plans) {
    // `parsePlans` é o MESMO parser da leitura do armazenamento: descarta item inválido em
    // silêncio e converte a versão 1. Uma segunda validação divergiria dele (§10).
    await plans.replaceAll(parsePlans(payload.plans))
    summary.imported.push('plans')
  }
  if (want.has('overrides') && payload.overrides) {
    for (const [id, categoryId] of Object.entries(payload.overrides)) {
      if (typeof categoryId === 'string') {
        await overrides.set(id, categoryId)
        summary.overrides += 1
      }
    }
    summary.imported.push('overrides')
  }
  if (want.has('preferences') && payload.preferences) {
    const prefs = payload.preferences
    if (prefs.scope) await preferences.setScope(prefs.scope)
    if (prefs.period) await preferences.setPeriod(prefs.period)
    if (prefs.theme) await preferences.setTheme(prefs.theme)
    summary.imported.push('preferences')
  }
  return summary
}
