import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { META, isMonth, lastMonthWithData, monthsBetween, projectionHorizon, selectTransactions, type Overrides, type Period, type Scope } from '@/lib/finance'
import { FiltersContext, type FiltersValue } from './use-filters'

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento indisponível: segue sem persistir
  }
}

function defaultPeriod(): Period {
  const all = META.months
  const to = all[all.length - 1]
  const [y, m] = to.split('-').map(Number)
  const fromDate = new Date(Date.UTC(y, m - 1 - 8, 1))
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}`
  // Extratos bancários começam em 2026-01; antes disso só há faturas parciais.
  const floor = all.find((x) => x >= '2026-01') ?? all[0]
  return { from: from < floor ? floor : from, to }
}

/**
 * Parâmetros de URL permitem abrir a app já num recorte: ?recorte=PJ&de=2026-01&ate=2026-06
 *
 * Cada limite vale sozinho. Exigir os dois fazia `?de=2026-05` ser descartado inteiro, e a
 * app abria no período padrão sem nenhum sinal de que o parâmetro tinha sido ignorado.
 */
function readUrl() {
  const params = new URLSearchParams(window.location.search)
  const scopeParam = params.get('recorte')
  const from = params.get('de')
  const to = params.get('ate')
  return {
    scope: scopeParam === 'PF' || scopeParam === 'PJ' || scopeParam === 'all' ? (scopeParam as Scope) : null,
    from: from && isMonth(from) ? from : null,
    to: to && isMonth(to) ? to : null,
  }
}

/** Teto do período, em meses. */
const MAX_MONTHS = 120

/**
 * Ordena e encaixa o período na janela que tem algo a mostrar: do primeiro mês com
 * lançamentos até o horizonte de projeção. Vale para o que vem do seletor, da URL e do
 * navegador — o seletor aceita qualquer mês, e fora dessa janela não existe barra para
 * desenhar, nem medida nem prevista.
 *
 * Truncar em 120 meses resolvia o tamanho e não o conteúdo: `?de=1900-01&ate=2030-12`
 * sobrepõe a faixa válida, escapava de qualquer descarte e abria em "Jan 00 até Dez 09",
 * com o painel inteiro vazio. Encaixar as duas pontas resolve os dois casos de uma vez,
 * e o teto de 120 meses fica como último recurso.
 */
function clampPeriod(p: Period): Period {
  const ordered = p.from <= p.to ? p : { from: p.to, to: p.from }
  const floor = META.months[0]
  const ceiling = projectionHorizon()
  // Sem interseção nenhuma não há o que encaixar: o período pedido fica inteiro fora.
  if (ordered.to < floor || ordered.from > ceiling) return defaultPeriod()
  const bounded = { from: ordered.from < floor ? floor : ordered.from, to: ordered.to > ceiling ? ceiling : ordered.to }
  const span = monthsBetween(bounded.from, bounded.to)
  return span.length > MAX_MONTHS ? { from: bounded.from, to: span[MAX_MONTHS - 1] } : bounded
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<Scope>(() => readUrl().scope ?? readStorage('wallet.scope', 'all'))
  const [period, setPeriodState] = useState<Period>(() => {
    const url = readUrl()
    const base = readStorage('wallet.period', defaultPeriod())
    return clampPeriod({ from: url.from ?? base.from, to: url.to ?? base.to })
  })
  const [overrides, setOverrides] = useState<Overrides>(() => readStorage('wallet.overrides', {}))

  const setScope = useCallback((s: Scope) => {
    setScopeState(s)
    writeStorage('wallet.scope', s)
  }, [])

  const setPeriod = useCallback((p: Period) => {
    const normalized = clampPeriod(p)
    setPeriodState(normalized)
    writeStorage('wallet.period', normalized)
  }, [])

  const setOverride = useCallback((id: string, categoryId: string | null) => {
    setOverrides((prev) => {
      const next = { ...prev }
      if (categoryId) next[id] = categoryId
      else delete next[id]
      writeStorage('wallet.overrides', next)
      return next
    })
  }, [])

  const months = useMemo(() => monthsBetween(period.from, period.to), [period])
  const transactions = useMemo(() => selectTransactions(scope, period, overrides), [scope, period, overrides])
  const history = useMemo(() => selectTransactions(scope, { from: META.months[0], to: lastMonthWithData() }, overrides), [scope, overrides])

  const value = useMemo<FiltersValue>(
    () => ({ scope, setScope, period, setPeriod, months, monthsWithData: META.months, overrides, setOverride, transactions, history }),
    [scope, setScope, period, setPeriod, months, overrides, setOverride, transactions, history],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}
