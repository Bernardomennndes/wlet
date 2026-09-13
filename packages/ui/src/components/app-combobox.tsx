import type { ComponentProps } from 'react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Button } from './button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from './combobox'
import { fold } from '@wlet/lib/search'
import { cn } from '@wlet/lib/utils'

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
  icon?: PhosphorIcon
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
  /**
   * Trava o gatilho enquanto uma escrita está em voo.
   *
   * Existe por um defeito MEDIDO e não por simetria de API: a escrita de um catálogo inteiro é
   * lê-aplica-grava, então dois controles acionados antes de a primeira gravação voltar leem o
   * mesmo retrato e o segundo `save` apaga o primeiro. Sem esta prop, uma linha de listagem não
   * tem como se calar durante a própria gravação.
   */
  disabled?: boolean
  /**
   * Variante e tamanho do gatilho, repassados ao `Button`.
   *
   * Numa linha de lista densa o seletor precisa ficar QUIETO até a linha ser apontada, e
   * "quieto" é `ghost`. É variante e altura do design system, não `className` de borda ou de
   * `h-*` escrita no call site — o que a §6 da regra de componentes proíbe.
   */
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}

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
export function AppCombobox({ value, onValueChange, items, className, id, searchPlaceholder = 'Buscar…', emptyValue, modified, disabled, variant = 'outline', size, ...aria }: AppComboboxProps) {
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
      // Realce automático no primeiro casamento da busca.
      //
      // Sem isto, digitar e apertar Enter FECHAVA o painel sem escolher nada: a busca filtrava
      // a lista, mas nenhum item ficava realçado, então o Enter não tinha o que selecionar. Um
      // no-op silencioso é o pior desfecho possível para um controle de busca — a pessoa
      // acredita que escolheu.
      //
      // Com a busca VAZIA ele não realça nada por conta própria: quem fica realçado é o item
      // já selecionado, então abrir o painel e apertar Enter confirma o valor que já estava
      // lá em vez de trocá-lo pelo primeiro da lista. É essa a diferença que torna a prop
      // segura num seletor de valor, e não só no de ação.
      autoHighlight
      filter={(item: SelectOption, query: string) => query.trim() === '' || fold(`${item.label} ${item.description ?? ''}`).includes(fold(query.trim()))}
    >
      <ComboboxTrigger
        id={id}
        aria-label={aria['aria-label']}
        disabled={disabled}
        render={<Button variant={variant} size={size} className={cn('justify-between font-normal', modified && 'border-ring', className)} />}
      >
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
