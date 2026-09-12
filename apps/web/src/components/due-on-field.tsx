import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Input } from '@wlet/ui/components/input'
import type { PlannedDueDate } from '@wlet/domain'

/**
 * Os tetos de cada forma de vencimento, num lugar só.
 *
 * Eles estavam em TRÊS literais aqui dentro e num QUARTO número no Zod da gaveta de previsão
 * (`routes/previsao/-components/planned-sheet.tsx`), que declara `nth` até 23 — e quem gravava
 * era o clamp daqui, com um teto menor. Dois números para o mesmo dado é a validação imperativa
 * que a `forms.md` §1 proíbe: a faixa é do schema, e o campo não pode inventar outra em silêncio.
 *
 * **O teto do dia útil é 18 porque é o que o VALIDADOR EM VIGOR aceita**, não porque 18 seja o
 * máximo aritmético de dias de semana num mês — não é: um mês de 31 dias começando na segunda
 * chega a 23. Mas `packages/ingest/src/pipeline.ts:578` recusa `nth > 18` e empurra o lançamento
 * para `plannedProblems`, e `lib/business-days.ts:91` declara a mesma faixa. Um campo mais
 * permissivo que o validador que o consome não conserta a divergência: inverte o lado dela, e
 * troca "recusa em silêncio" por "aceita e quebra na ingestão", que é pior porque o sintoma
 * aparece longe da causa.
 *
 * Subir para 23 é decisão de DOMÍNIO e muda quatro lugares no mesmo commit: as duas guardas de
 * `pipeline.ts` (lançamento previsto e cobrança), o comentário de `business-days.ts` e os
 * schemas. Enquanto isso não acontece, o teto daqui acompanha quem recusa.
 *
 * Exportados para que o schema de cada formulário consuma ESTA constante em vez de repetir o
 * número. Enquanto Cobranças não tiver schema, o clamp abaixo é a única faixa que ela tem.
 */
export const MAX_DAY_OF_MONTH = 31
export const MAX_BUSINESS_DAY_OF_MONTH = 18

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
          onValueChange={(v) => onChange(v === 'day' ? { kind: 'day', day: Math.min(MAX_DAY_OF_MONTH, n) } : { kind: 'business-day', nth: Math.min(MAX_BUSINESS_DAY_OF_MONTH, n) })}
          aria-label={label}
          className="w-36"
        />
      </label>
      <label className="space-y-1">
        <span className="text-muted-foreground block">{kind === 'day' ? 'Dia' : 'Qual dia útil'}</span>
        <Input
          type="number"
          min={1}
          max={kind === 'day' ? MAX_DAY_OF_MONTH : MAX_BUSINESS_DAY_OF_MONTH}
          className="w-20"
          disabled={disabled}
          value={n}
          onChange={(e) => {
            const raw = Number(e.target.value) || 1
            const max = kind === 'day' ? MAX_DAY_OF_MONTH : MAX_BUSINESS_DAY_OF_MONTH
            const clamped = Math.min(max, Math.max(1, raw))
            onChange(kind === 'day' ? { kind: 'day', day: clamped } : { kind: 'business-day', nth: clamped })
          }}
        />
      </label>
    </>
  )
}
