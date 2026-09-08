import { useState, type ComponentProps } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatMonthShort } from '@/lib/format'
import { cn } from '@/lib/utils'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface Props {
  /** Mês selecionado, no formato AAAA-MM. */
  value: string
  onValueChange: (month: string) => void
  'aria-label': string
  /** Liga o gatilho ao `FieldLabel`: sem ele o rótulo aponta para um id que não existe. */
  id?: string
  /**
   * O tamanho do gatilho, repassado ao `Button`.
   *
   * Existe para o call site não precisar de `className="h-*"`: altura é o que a prop `size`
   * do design system controla, e sobrepô-la por classe é o que a §6 da regra de componentes
   * proíbe. Quem precisa casar a altura com os vizinhos de uma linha declara aqui.
   */
  size?: ComponentProps<typeof Button>['size']
  /** Meses que têm lançamentos: ganham um ponto, para saber onde os dados estão. */
  withData?: readonly string[]
  /**
   * Primeiro mês escolhível (AAAA-MM). Antes dele o mês fica DESABILITADO e a seta do ano
   * para: sem isso o seletor oferece 2019, quem clica é corrigido em silêncio pelo
   * `clampPeriod` e o mês exibido salta para outro sem nenhuma explicação. Um limite que
   * existe precisa ser visível no lugar onde a escolha é feita.
   */
  min?: string
  className?: string
}

/**
 * Seletor de ano e mês. O registry não tem equivalente — o `calendar` dele é baseado
 * em react-day-picker e trabalha no nível do dia, o que sugeriria uma precisão que os
 * dados não têm. Aqui a grade é de 12 meses com um passo de ano, então qualquer mês de
 * qualquer ano é alcançável.
 */
export function MonthPicker({ value, onValueChange, withData, className, id, min, size, ...aria }: Props) {
  const [open, setOpen] = useState(false)
  const selectedYear = Number(value.slice(0, 4))
  const [year, setYear] = useState(selectedYear)

  const hasData = new Set(withData ?? [])
  const firstYear = min ? Number(min.slice(0, 4)) : Number.NEGATIVE_INFINITY

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Reabrir sempre volta para o ano do valor atual, não para onde parou antes.
        if (next) setYear(selectedYear)
      }}
    >
      <PopoverTrigger
        render={
          <Button id={id} variant="outline" size={size} aria-label={aria['aria-label']} className={cn('font-medium tabular-nums', className)}>
            {formatMonthShort(value)}
            <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-60 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" aria-label="Ano anterior" disabled={year <= firstYear} onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft />
          </Button>
          <span className="text-sm font-semibold tabular-nums">{year}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Próximo ano" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1" role="listbox" aria-label={aria['aria-label']}>
          {MONTHS.map((label, index) => {
            const month = `${year}-${String(index + 1).padStart(2, '0')}`
            const selected = month === value
            // Só o passado é limitado. O futuro é aberto de propósito: um plano ou uma parcela
            // pode cair a qualquer distância, e um teto ali esconderia o mês que se quer ver.
            const before = min !== undefined && month < min
            return (
              <Button
                key={month}
                role="option"
                aria-selected={selected}
                aria-disabled={before}
                disabled={before}
                variant={selected ? 'default' : 'ghost'}
                size="sm"
                className="relative justify-center capitalize"
                onClick={() => {
                  onValueChange(month)
                  setOpen(false)
                }}
              >
                {label}
                {hasData.has(month) && !selected ? <span className="absolute bottom-1 size-1 rounded-full bg-muted-foreground" aria-hidden /> : null}
              </Button>
            )
          })}
        </div>
        {withData?.length ? (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-1 rounded-full bg-muted-foreground" aria-hidden />
            mês com lançamentos
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
