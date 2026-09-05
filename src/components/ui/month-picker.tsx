import { useState } from 'react'
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
  /** Meses que têm lançamentos: ganham um ponto, para saber onde os dados estão. */
  withData?: readonly string[]
  className?: string
}

/**
 * Seletor de ano e mês. O registry não tem equivalente — o `calendar` dele é baseado
 * em react-day-picker e trabalha no nível do dia, o que sugeriria uma precisão que os
 * dados não têm. Aqui a grade é de 12 meses com um passo de ano, então qualquer mês de
 * qualquer ano é alcançável.
 */
export function MonthPicker({ value, onValueChange, withData, className, ...aria }: Props) {
  const [open, setOpen] = useState(false)
  const selectedYear = Number(value.slice(0, 4))
  const [year, setYear] = useState(selectedYear)

  const hasData = new Set(withData ?? [])

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
          <Button variant="outline" aria-label={aria['aria-label']} className={cn('font-medium tabular-nums', className)}>
            {formatMonthShort(value)}
            <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-60 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" aria-label="Ano anterior" onClick={() => setYear((y) => y - 1)}>
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
            return (
              <Button
                key={month}
                role="option"
                aria-selected={selected}
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
