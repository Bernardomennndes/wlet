import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { categoryLabel } from '@wlet/domain'
import { translateRemoteError } from '@wlet/services/shared/domain/errors'
import { toast } from '@wlet/ui/toast'
import { api } from '@/lib/api'
import { services } from '@/lib/services'
import { preloaded } from './preloaded'
import { META, firstMonthWithData, isMonth, lastMonthWithData, monthsBetween, projectionHorizon, selectTransactions, type Overrides, type Period, type Scope } from '@/lib/finance'
import { FiltersContext, type FiltersValue } from './use-filters'

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
  // `lastMonthWithData()` e não `all[all.length - 1]`: sem lançamento nenhum o segundo é
  // `undefined` e derruba o app no primeiro render, enquanto o primeiro recua para o mês
  // corrente. Um conjunto vazio é estado legítimo aqui — clone novo, navegador limpo.
  const [y, m] = lastMonthWithData().split('-').map(Number)
  const fromDate = new Date(Date.UTC(y, m - 1 - 8, 1))
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}`
  // Extratos bancários começam em 2026-01; antes disso só há faturas parciais.
  const floor = all.find((x) => x >= '2026-01') ?? firstMonthWithData()
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
  const floor = firstMonthWithData()
  // Sem interseção nenhuma não há o que encaixar: o período pedido termina antes do primeiro
  // lançamento, então fica inteiro fora.
  if (ordered.to < floor) return defaultPeriod()
  const bounded = { from: ordered.from < floor ? floor : ordered.from, to: ordered.to }
  const span = monthsBetween(bounded.from, bounded.to)
  return span.length > MAX_MONTHS ? { from: bounded.from, to: span[MAX_MONTHS - 1] } : bounded
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // Recorte e período nascem do que o boot carregou, e o inicializador de `useState` é síncrono
  // por definição — é por isso que essa metade não virou `useQuery`. Ver o bloco sobre os dois
  // logo abaixo.
  const saved = preloaded().preferences

  const [scope, setScopeState] = useState<Scope>(() => readUrl().scope ?? saved.scope ?? 'all')
  const [period, setPeriodState] = useState<Period>(() => {
    const url = readUrl()
    const base = saved.period ?? defaultPeriod()
    return clampPeriod({ from: url.from ?? base.from, to: url.to ?? base.to })
  })

  /**
   * Os AJUSTES são dado, e por isso vêm do cache — ao contrário de recorte e período.
   *
   * A chave vem do contrato (§4), e `queryFn` do serviço: `list()` é o que o adapter usa para
   * saber o que MUDOU na próxima gravação, e pular o serviço aqui o deixaria com um retrato vazio.
   */
  const { data: overrides } = useQuery({
    queryKey: api().overrides.list.key(),
    queryFn: () => services().overrides.list(),
    initialData: () => preloaded().overrides,
  })

  /**
   * **Recorte e período NÃO ganham aviso de sucesso, e isso é decisão, não esquecimento.**
   *
   * A §5 pede toast em toda mutação porque toda mutação é algo que a pessoa mandou guardar. Trocar
   * o recorte para "Pessoa jurídica" ou arrastar o período não é isso: é o que ela está OLHANDO, e
   * a confirmação já está na tela inteira se redesenhando. Um aviso a cada mês arrastado seria a
   * definição do toast que se aprende a ignorar — exatamente o que a regra quer evitar.
   *
   * O ERRO, esse aparece: a gravação falhada passa pelo mesmo aviso global das outras escritas, e
   * não mais por um `console.error` que ninguém lê. Um app que promete lembrar a preferência e não
   * lembra precisa dizer.
   */
  const persist = useCallback((promise: Promise<unknown>) => {
    // A MESMA tradução do `MutationCache`: "sua sessão expirou" e "o servidor não respondeu"
    // pedem coisas diferentes de quem lê, e um texto fixo apagaria essa diferença.
    void promise.catch((cause: unknown) => toast.error(translateRemoteError(cause).message))
  }, [])

  const setScope = useCallback(
    (s: Scope) => {
      setScopeState(s)
      persist(services().preferences.setScope(s))
    },
    [persist],
  )

  const setPeriod = useCallback(
    (p: Period) => {
      // `clampPeriod` fica AQUI e não no serviço: ele resolve o que a URL pode trazer — limite
      // invertido, período que termina antes do primeiro lançamento, janela absurda de 120
      // meses. É política de exibição. O serviço aplica o piso de novo, e é idempotente.
      const normalized = clampPeriod(p)
      setPeriodState(normalized)
      persist(services().preferences.setPeriod(normalized))
    },
    [persist],
  )

  /**
   * Recategorizar JÁ É um "guardar", e por isso este ganha aviso — com o nome da categoria.
   *
   * A diferença para o recorte não é de tamanho: a pessoa está corrigindo o que o ingest decidiu
   * sobre um lançamento, e o efeito disso reaparece em toda tela que soma por categoria. Confirmar
   * qual categoria entrou é o que separa "cliquei certo" de "cliquei na linha de cima".
   *
   * A tela não espera a resposta: `setQueryData` move a tabela na hora, e a invalidação traz a
   * verdade em seguida. Se a gravação falhar, o aviso global diz — e a linha volta sozinha, porque
   * o refetch da invalidação desfaz o otimismo.
   */
  const { mutate: saveOverride } = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) => services().overrides.set(id, categoryId),
    onSuccess: (saved, { categoryId }) => {
      queryClient.setQueryData(api().overrides.list.key(), saved)
      toast.success(categoryId ? `Lançamento movido para ${categoryLabel(categoryId)}` : 'Lançamento devolvido à categoria automática')
    },
    // `onSettled` e não `onSuccess`: a invalidação precisa acontecer também no ERRO. O otimismo
    // abaixo já mexeu na tabela, e sem este refetch uma falha deixaria a tela mostrando uma
    // categoria que o servidor não tem — a mentira mais cara que um ajuste manual pode contar.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: api().overrides.list.key() })
    },
  })

  const setOverride = useCallback(
    (id: string, categoryId: string | null) => {
      // Otimismo ANTES da resposta: a tabela de transações é longa, e esperar a rede para pintar a
      // linha faria o clique parecer perdido.
      queryClient.setQueryData<Overrides>(api().overrides.list.key(), (prev) => {
        const next = { ...(prev ?? {}) }
        if (categoryId) next[id] = categoryId
        else delete next[id]
        return next
      })
      saveOverride({ id, categoryId })
    },
    [queryClient, saveOverride],
  )

  const months = useMemo(() => monthsBetween(period.from, period.to), [period])
  const transactions = useMemo(() => selectTransactions(scope, period, overrides), [scope, period, overrides])
  const history = useMemo(() => selectTransactions(scope, { from: firstMonthWithData(), to: lastMonthWithData() }, overrides), [scope, overrides])

  const value = useMemo<FiltersValue>(
    () => ({ scope, setScope, period, setPeriod, months, monthsWithData: META.months, overrides, setOverride, transactions, history }),
    [scope, setScope, period, setPeriod, months, overrides, setOverride, transactions, history],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}
