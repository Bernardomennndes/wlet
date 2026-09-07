import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  /**
   * Texto secundário, alinhado à direita do rótulo — o grupo a que a opção pertence, o que
   * ela abrange.
   *
   * Ele entra na BUSCA, não só na tela: com a descrição fora do casamento, digitar "padaria"
   * deixaria de encontrar "Mercado", que é justamente o que a descrição serve para permitir.
   * E fica em coluna própria em vez de emendado no rótulo — juntar os dois numa string só
   * ("Mercado · Supermercados e padarias") dá o mesmo peso visual às duas, e o olho varre a
   * lista pelo NOME. A descrição é desempate, não conteúdo.
   */
  description?: string
  /** Ícone à esquerda. Sai da lista de enum do domínio, nunca escolhido no call site. */
  icon?: LucideIcon
}

interface AppComboboxProps {
  value: string
  onValueChange: (value: string) => void
  items: SelectOption[]
  'aria-label'?: string
  id?: string
  className?: string
  /** Texto do campo de busca dentro do painel. */
  searchPlaceholder?: string
  /**
   * O valor do SENTINELA — "Todas as contas", "Sem grupo". Quando ele é o escolhido, o
   * gatilho o desenha esmaecido: não é uma escolha, é a ausência dela, e imprimi-lo com o
   * mesmo peso de uma conta de verdade faria "Todas as contas" parecer um filtro ativo.
   */
  emptyValue?: string
  /**
   * Marca o gatilho como alterado em relação ao valor automático. É variante do componente, e
   * não `border-*` vindo do call site, porque a cor da borda é decisão do design system.
   */
  modified?: boolean
}

/** Sem acento e sem caixa: em português, quem digita "alimentacao" está procurando "Alimentação". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Seletor de opção única com busca, sobre o Combobox do registry (Base UI).
 *
 * Existe porque um `Select` cru obriga a percorrer a lista inteira com o olho: com 34
 * categorias, achar "Restaurantes e delivery" é rolagem, não escolha. A API espelha a que o
 * `AppSelect` tinha — value/onValueChange em string —, o que tornou a substituição dele
 * mecânica e mantém o sentinela "all" valendo.
 *
 * O gatilho fica FORA e o campo de busca DENTRO do painel. Pôr o `ComboboxInput` como
 * gatilho parece equivalente e não é: ele mantém o rótulo escolhido como valor do campo, e
 * digitar insere no meio dele ("Todas as categrestorias"), de modo que a busca nunca casa.
 *
 * **A opção escolhida é marcada por um CHECK**, que o `ComboboxItem` do registry já desenha —
 * não por cor. Cor sozinha não é percebida por quem não a distingue nem anunciada por leitor
 * de tela (WCAG 1.4.1), e aqui ela já está tomada pelo destaque do teclado.
 */
export function AppCombobox({ value, onValueChange, items, className, id, searchPlaceholder = 'Buscar…', emptyValue, modified, ...aria }: AppComboboxProps) {
  const selected = items.find((item) => item.value === value) ?? null
  const Icon = selected?.icon
  const muted = selected === null || selected.value === emptyValue

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(item: SelectOption | null) => onValueChange(item ? item.value : '')}
      itemToStringLabel={(item: SelectOption) => item.label}
      isItemEqualToValue={(a: SelectOption, b: SelectOption) => a.value === b.value}
      // O `filter` da raiz é o que deixa a descrição participar da busca SEM entrar no rótulo
      // que o gatilho exibe — os dois seriam a mesma string se isso saísse de `itemToStringLabel`.
      filter={(item: SelectOption, query: string) => query.trim() === '' || fold(`${item.label} ${item.description ?? ''}`).includes(fold(query.trim()))}
    >
      <ComboboxTrigger id={id} aria-label={aria['aria-label']} render={<Button variant="outline" className={cn('justify-between font-normal', modified && 'border-ring', className)} />}>
        <span className="flex min-w-0 items-center gap-1.5">
          {Icon ? <Icon className="size-3 shrink-0 text-muted-foreground" /> : null}
          <span className={cn('truncate', muted && 'text-muted-foreground')}>{selected?.label ?? 'Selecionar…'}</span>
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty>Nenhuma opção corresponde à busca</ComboboxEmpty>
        <ComboboxList>
          {(item: SelectOption) => (
            // `pr-6` reserva a faixa do check, que o registry posiciona em `absolute right-2`:
            // sem ela a descrição passa por baixo dele.
            <ComboboxItem key={item.value} value={item} className="pr-6">
              {item.icon ? <item.icon className="size-3 shrink-0 text-muted-foreground" /> : null}
              {/* Grade, não flex: a descrição fica na própria coluna, então as bordas direitas
                  se alinham de linha para linha, independentemente do comprimento dos nomes. */}
              <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-2">
                <span className="truncate">{item.label}</span>
                {item.description ? <span className="truncate text-[0.6875rem] text-muted-foreground">{item.description}</span> : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
