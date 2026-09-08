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

/**
 * O padrão vai do nono mês atrás até o HORIZONTE DE PROJEÇÃO, não até o último mês com dados.
 *
 * Ele terminava na última medição, e com o período governando todas as telas isso deixaria
 * Previsão e Planos vazias por padrão — elas olham para a frente, e não haveria mês futuro
 * dentro da janela. Incluir a projeção no padrão é o que torna "o filtro vale em toda tela"
 * uma regra que não quebra nenhuma delas; quem quiser só o medido estreita o fim.
 */
function defaultPeriod(): Period {
  const all = META.months
  const to = projectionHorizon()
  const [y, m] = all[all.length - 1].split('-').map(Number)
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
 * Ordena e encaixa o período. O PISO é o primeiro mês com lançamentos: antes dele não existe
 * barra para desenhar, e um período que começa em 2019 abre o painel inteiro vazio.
 *
 * **O TETO foi removido.** Ele era o horizonte de projeção, e isso impedia de olhar para onde
 * os compromissos de fato caem: uma compra em 12× feita em novembro chega até o fim do ano
 * seguinte, e um plano pode ser marcado para qualquer mês. Com o teto, escolher esse mês
 * devolvia silenciosamente o fim do ano corrente. Mês futuro sem nada a mostrar desenha uma
 * coluna vazia, que é dado — bem diferente de recusar a pergunta.
 *
 * Truncar em 120 meses resolvia o tamanho e não o conteúdo: `?de=1900-01&ate=2030-12`
 * sobrepõe a faixa válida, escapava de qualquer descarte e abria em "Jan 00 até Dez 09",
 * com o painel inteiro vazio. Encaixar o piso resolve isso, e o teto de 120 meses fica como
 * último recurso contra um período absurdamente largo.
 */
function clampPeriod(p: Period): Period {
  const ordered = p.from <= p.to ? p : { from: p.to, to: p.from }
  const floor = META.months[0]
  // Sem interseção nenhuma não há o que encaixar: o período pedido termina antes do primeiro
  // lançamento, então fica inteiro fora.
  if (ordered.to < floor) return defaultPeriod()
  const bounded = { from: ordered.from < floor ? floor : ordered.from, to: ordered.to }
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
