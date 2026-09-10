import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Input } from '@wlet/ui/components/input'
import type { PlannedDueDate } from '@wlet/domain'

const KIND_ITEMS = [
  { value: 'day', label: 'Dia fixo', description: 'Todo dia 25, por exemplo.' },
  { value: 'business-day', label: 'Dia útil', description: 'O 5º dia útil, pelo calendário bancário — fins de semana e feriados não contam.' },
]

/**
 * Mora em `src/components/` e não no `-components/` de uma rota porque DUAS telas o usam — a
 * gaveta de lançamento previsto, em Previsão, e a seção de cobranças, em Configuração. É a §2
 * da organização de rotas: o `-components/` é do que pertence a uma tela só.
 *
 * O dia em que uma declaração vence.
 *
 * Extraído porque `PlannedEntry` e `Receivable` usam o MESMO `PlannedDueDate`, e as duas telas
 * precisariam da mesma dupla de campos — o segundo caminho seria a cópia do primeiro, e as
 * duas divergiriam no primeiro ajuste.
 *
 * A faixa do dia útil para em 18 de propósito: nenhum mês tem mais dias úteis que isso, e um
 * número acima disso passaria silencioso, jogando a ocorrência para o fim do mês seguinte.
 */
export function DueOnField({ value, onChange, disabled, label }: { value: PlannedDueDate | undefined; onChange: (next: PlannedDueDate) => void; disabled: boolean; label: string }) {
  const kind = value?.kind ?? 'day'
  const n = value ? (value.kind === 'day' ? value.day : value.nth) : 1

  return (
    <>
      <label className="space-y-1">
        <span className="text-muted-foreground block">{label}</span>
        <AppCombobox
          items={KIND_ITEMS}
          value={kind}
          onValueChange={(v) => onChange(v === 'day' ? { kind: 'day', day: Math.min(31, n) } : { kind: 'business-day', nth: Math.min(18, n) })}
          aria-label={label}
          className="w-36"
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block">{kind === 'day' ? 'Dia' : 'Qual dia útil'}</span>
        <Input
          type="number"
          min={1}
          max={kind === 'day' ? 31 : 18}
          className="w-20"
          disabled={disabled}
          value={n}
          onChange={(e) => {
            const raw = Number(e.target.value) || 1
            const max = kind === 'day' ? 31 : 18
            const clamped = Math.min(max, Math.max(1, raw))
            onChange(kind === 'day' ? { kind: 'day', day: clamped } : { kind: 'business-day', nth: clamped })
          }}
        />
      </label>
    </>
  )
}
