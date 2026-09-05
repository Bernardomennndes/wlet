import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface AppSelectProps {
  value: string
  onValueChange: (value: string) => void
  items: SelectOption[]
  'aria-label'?: string
  id?: string
  className?: string
  size?: 'sm' | 'default'
  /**
   * Marca o gatilho como alterado em relação ao valor automático. É variante do
   * componente, e não `border-*` vindo do call site, porque a cor da borda é decisão do
   * design system — e porque um estado semântico precisa de um par não-cromático, que
   * aqui é o botão de desfazer ao lado.
   */
  modified?: boolean
}

/** Select de valor único sobre os primitivos oficiais do shadcn (Base UI). */
export function AppSelect({ value, onValueChange, items, className, size, id, modified, ...aria }: AppSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => next !== null && onValueChange(next)} items={items}>
      <SelectTrigger id={id} aria-label={aria['aria-label']} className={cn(modified && 'border-ring', className)} size={size}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
