import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from '@/components/ui/combobox'
import type { SelectOption } from '@/components/ui/app-select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AppComboboxProps {
  value: string
  onValueChange: (value: string) => void
  items: SelectOption[]
  'aria-label'?: string
  id?: string
  className?: string
  /** Texto do campo de busca dentro do painel. */
  searchPlaceholder?: string
}

/**
 * Filtro de opções com busca, sobre o Combobox do registry (Base UI).
 *
 * Existe porque um `Select` cru obriga a percorrer a lista inteira com o olho: com 34
 * categorias, achar "Restaurantes e delivery" é rolagem, não escolha. A API espelha a do
 * `AppSelect` de propósito — value/onValueChange em string —, para a troca de um pelo
 * outro ser mecânica e o sentinela "all" continuar valendo.
 *
 * O gatilho fica FORA e o campo de busca DENTRO do painel. Pôr o `ComboboxInput` como
 * gatilho parece equivalente e não é: ele mantém o rótulo escolhido como valor do campo, e
 * digitar insere no meio dele ("Todas as categrestorias"), de modo que a busca nunca casa.
 */
export function AppCombobox({ value, onValueChange, items, className, id, searchPlaceholder = 'Buscar…', ...aria }: AppComboboxProps) {
  const selected = items.find((item) => item.value === value) ?? null
  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(item: SelectOption | null) => onValueChange(item ? item.value : '')}
      itemToStringLabel={(item: SelectOption) => item.label}
      isItemEqualToValue={(a: SelectOption, b: SelectOption) => a.value === b.value}
    >
      <ComboboxTrigger id={id} aria-label={aria['aria-label']} render={<Button variant="outline" className={cn('justify-between font-normal', className)} />}>
        <ComboboxValue />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty>Nenhuma opção corresponde à busca</ComboboxEmpty>
        <ComboboxList>
          {(item: SelectOption) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
