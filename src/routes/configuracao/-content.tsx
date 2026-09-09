import { ArrowsClockwise, CheckCircle, Warning } from '@phosphor-icons/react'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { AccountsSection } from './-components/accounts-section'
import { BudgetSection } from './-components/budget-section'
import { GoalsSection } from './-components/goals-section'
import { PlannedSection } from './-components/planned-section'
import { ReceivablesSection } from './-components/receivables-section'
import { RulesSection } from './-components/rules-section'
import { TripsSection } from './-components/trips-section'
import { useDeclarations } from './-components/use-declarations'

/**
 * O que você declara ao app, editável aqui em vez de num arquivo `.ts`.
 *
 * As telas leem constantes fixadas no BOOT, então uma alteração aqui não muda a Previsão na
 * mesma hora. A tela diz isso em vez de fingir: prometer efeito imediato e não entregar é pior
 * do que pedir um recarregamento.
 *
 * E há uma segunda distinção, que não é óbvia: perfil de conta e regra de categoria agem
 * durante a LEITURA dos arquivos, então elas não bastam recarregar — precisam de reprocessar,
 * em Meus dados. As outras cinco só precisam de recarregar.
 */
export function ConfiguracaoPageContent() {
  useDocumentTitle('Configuração')
  const { current, saving, error, dirty, save } = useDeclarations()

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Configuração</h1>
          <p className="text-muted-foreground text-xs">O que você declara ao app. Fica guardado neste navegador.</p>
        </div>
      </header>

      {error && (
        <p className="text-destructive flex items-start gap-2 text-xs">
          <Warning className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {dirty && !error && (
        <p className="flex items-start gap-2 text-xs">
          <CheckCircle className="mt-0.5 shrink-0" />
          <span>
            Guardado.{' '}
            <button type="button" className="underline" onClick={() => window.location.reload()}>
              Recarregue a página
            </button>{' '}
            para as outras telas passarem a usar.
          </span>
        </p>
      )}

      {/* A ordem é a do que se mexe com mais frequência: teto e rubricas primeiro, perfis de
          conta e regras por último — os dois que quase nunca mudam e que, quando mudam, pedem
          reprocessamento. */}
      <BudgetSection budget={current.budget} disabled={saving} onChange={(budget) => save({ budget })} />
      <PlannedSection entries={current.planned} disabled={saving} onChange={(planned) => save({ planned })} />
      <ReceivablesSection receivables={current.receivables} disabled={saving} onChange={(receivables) => save({ receivables })} />
      <GoalsSection goals={current.goals} disabled={saving} onChange={(goals) => save({ goals })} />
      <TripsSection trips={current.trips} disabled={saving} onChange={(trips) => save({ trips })} />

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <ArrowsClockwise className="mt-0.5 shrink-0" />
        As duas seções abaixo agem na LEITURA dos arquivos: mudá-las exige <strong className="text-foreground font-medium">reprocessar</strong> em Meus dados, não só recarregar.
      </p>

      <AccountsSection accounts={current.accounts} disabled={saving} onChange={(accounts) => save({ accounts })} />
      <RulesSection rules={current.rules} disabled={saving} onChange={(rules) => save({ rules })} />
    </div>
  )
}
