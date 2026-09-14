import { CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { formatMonthShort } from '@wlet/lib/format'
import { cn } from '@wlet/lib/utils'
import { type ComponentProps, useState } from 'react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

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
  /** Trava o gatilho enquanto uma escrita está em voo — ver a mesma prop em `app-combobox.tsx`. */
  disabled?: boolean
  /**
   * A variante do gatilho, repassada ao `Button`.
   *
   * Existe pela mesma razão que `size`: numa linha de lista densa o seletor precisa ficar
   * QUIETO até a linha ser apontada, e "quieto" é `ghost` — uma decisão de variante, que a §6
   * manda pedir ao design system em vez de escrever `border-transparent` no call site.
   */
  variant?: ComponentProps<typeof Button>['variant']
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
export function MonthPicker({ value, onValueChange, withData, className, id, min, size, disabled, variant = 'outline', ...aria }: Props) {
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
        disabled={disabled}
        render={
          <Button id={id} variant={variant} size={size} aria-label={aria['aria-label']} className={cn('font-medium justify-between tabular-nums', className)}>
            {formatMonthShort(value)}
            <CaretDown data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      />
      {/*
        `p-0` no contêiner e o padding POR SEÇÃO: é o que permite a régua abaixo do cabeçalho
        sangrar de borda a borda. Com o padding no contêiner ela nasceria recuada dos dois
        lados e leria como um traço solto no meio do painel, em vez de separar duas áreas.

        `gap-0` é CONSEQUÊNCIA disso, não gosto: o `PopoverContent` do registry é
        `flex flex-col gap-4`, e esses 16px continuavam empurrando cada seção — a primeira
        linha de meses nascia 40px abaixo da régua em vez dos 24px pedidos pelo `pt`, e o
        painel inteiro crescia. Com o espaçamento declarado seção a seção, um segundo
        espaçador no contêiner só some com as medidas.
      */}
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          {/*
            As setas são `outline`, não `ghost`: no alto de um painel sem mais nada em volta,
            um botão sem contorno só existe depois que o ponteiro passa por cima — e a
            navegação por ano é justamente o que precisa estar visível antes de ser procurado.
          */}
          <Button variant="outline" size="icon-lg" aria-label="Ano anterior" disabled={year <= firstYear} onClick={() => setYear((y) => y - 1)}>
            <CaretLeft />
          </Button>
          <span className="text-sm font-semibold tabular-nums">{year}</span>
          <Button variant="outline" size="icon-lg" aria-label="Próximo ano" onClick={() => setYear((y) => y + 1)}>
            <CaretRight />
          </Button>
        </div>
        {/*
          TRÊS colunas, e isso põe um TRIMESTRE por linha — jan/fev/mar, abr/mai/jun. Uma
          versão anterior usava quatro alegando esse mesmo motivo, o que era simplesmente
          falso: 4×3 agrupa de quatro em quatro, que não é recorte de calendário nenhum.

          E a grade não tem LINHA: a separação vem do espaço entre as células, não de bordas.
          Enquanto cada célula levava `border-r border-b`, o painel desenhava uma tabela, e a
          moldura competia com o único elemento que precisa saltar aqui — o mês escolhido, que
          é sólido. Sem as bordas, o que o olho encontra primeiro é a seleção.

          As medidas saem da referência por PROPORÇÃO, não a olho: tudo que ela define está
          em fração da largura do painel, e num popover de 288px (`w-72`) essas frações caem
          quase em cima dos tokens — seta 11,9% ≈ 32px (`size-8`), altura da célula 10,7% ≈
          32px (`h-8`), passo entre linhas 16,4% ≈ 48px (`h-8` + `gap-y-4`), respiro lateral
          7,2% ≈ 20px (`px-5`) e régua→primeira linha 10,3% ≈ 28px (`pt-7`). O painel era
          `w-64` e ficava proporcionalmente mais apertado que a referência em todas elas.

          O que NÃO veio da referência é a escala tipográfica: ali o rótulo mede ~5,4% da
          largura (≈15px aqui), e o `size="lg"` do Button escreve em `text-xs`. Sobrepor a
          fonte por classe é o que a §6 proíbe — tamanho é decisão do design system —, e este
          painel é denso como o resto do app. É o mesmo desvio já declarado para a escala de
          cabeçalho.
        */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-4 px-5 pt-7 pb-5" role="listbox" aria-label={aria['aria-label']}>
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
                // `lg` (h-8) e não `sm` (h-6), e isto resolve DOIS problemas de uma vez: a
                // célula fica com a proporção da referência, larga e baixa; e sobra altura
                // para o ponto viver ABAIXO do rótulo. Com h-6 os 4px do `bottom-1` caíam
                // dentro da caixa do texto, e o ponto encostava nos descendentes — lia como
                // erro de digitação, não como indicador.
                size="lg"
                // `w-full` porque a célula da grade é mais larga que o conteúdo: sem ele o
                // botão encolhe até o rótulo e o preenchido da seleção vira uma etiqueta
                // estreita, desalinhada das outras colunas.
                className="relative w-full justify-center capitalize"
                onClick={() => {
                  onValueChange(month)
                  setOpen(false)
                }}
              >
                {label}
                {/*
                  O ponto é `primary` — a mesma tinta do mês selecionado. Ele responde "onde
                  estão os dados", que é a pergunta que traz a pessoa até aqui, e em
                  `muted-foreground` ele competia em peso com o próprio rótulo do mês.
                  Continua escondido no mês SELECIONADO: ali o fundo já é `primary` e o ponto
                  sumiria dentro dele.
                */}
                {hasData.has(month) && !selected ? <span className="absolute bottom-1 size-1 rounded-full bg-primary" aria-hidden /> : null}
              </Button>
            )
          })}
        </div>
        {/* Sem `mt`: os 12px de baixo da grade já são o respiro, e somar os dois afastaria a
            legenda do que ela legenda. */}
        {withData?.length ? (
          <p className="flex items-center gap-1.5 px-5 pb-5 text-[11px] text-muted-foreground">
            <span className="inline-block size-1 rounded-full bg-primary" aria-hidden />
            mês com lançamentos
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
