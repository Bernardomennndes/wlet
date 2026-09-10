import { useCallback, useRef, useState } from 'react'
import type { Declarations } from '@/lib/ingest/pipeline'
import { declarations } from '@/lib/dataset'
import { services } from '@/services'

/**
 * O estado das declarações numa tela que as edita.
 *
 * Mora em `src/hooks/` e não no `-components/` de uma rota porque DUAS telas o usam — a
 * Configuração e a de Rubricas —, e a §2 da organização de rotas reserva o `-components/` ao
 * que pertence a uma tela só.
 *
 * A LEITURA inicial vem do portão de boot, síncrona — é a mesma cópia que as outras telas
 * usam, então abrir a configuração não pode mostrar um valor diferente do que a Previsão
 * mostra. As ESCRITAS vão pelo serviço e devolvem o agregado inteiro, e é dele que o estado
 * sai: montar o próximo objeto aqui abriria espaço para a tela divergir do que foi gravado.
 *
 * Editar NÃO recarrega o app. As outras telas leem constantes fixadas no boot, então o efeito
 * só aparece depois de recarregar — a tela diz isso em vez de fingir que já mudou.
 */
export interface DeclarationsState {
  current: Declarations
  saving: boolean
  error: string | null
  dirty: boolean
  save: (change: Partial<Declarations>) => void
}

export function useDeclarations(): DeclarationsState {
  const [current, setCurrent] = useState<Declarations>(() => declarations())
  /**
   * O valor corrente para a PRÓXIMA gravação.
   *
   * Sem ele, cada `save` partiria de `declarations()` — o retrato do boot — e duas edições
   * seguidas perderiam a primeira, porque a segunda gravaria sobre um estado velho. O ref
   * existe porque `save` é assíncrono e não pode depender do fechamento em que foi criado.
   */
  const latest = useRef<Declarations>(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const save = useCallback((change: Partial<Declarations>) => {
    setSaving(true)
    setError(null)
    void services()
      .config.replace({ ...latest.current, ...change })
      .then((next) => {
        latest.current = next
        setCurrent(next)
        setDirty(true)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setSaving(false))
  }, [])

  return { current, saving, error, dirty, save }
}
