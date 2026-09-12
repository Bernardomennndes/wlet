import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { fold } from '@wlet/lib/search'
import { Button } from '@wlet/ui/components/button'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@wlet/ui/components/combobox'

export interface CategoryChoice {
  value: string
  label: string
  description?: string
}

/**
 * O botão que acrescenta uma rubrica escolhendo a categoria.
 *
 * Era um `AppCombobox` com uma opção-sentinela, e o defeito não era de estilo: um combobox
 * AFIRMA UM VALOR. O gatilho exibia "Adicionar rubrica…" como se fosse a categoria escolhida,
 * a linha do sentinela aparecia na lista podendo ser selecionada e vinha com o ✓ de
 * "selecionada" — um check ao lado de uma ação, que não é um estado. Aqui o controle é uma
 * AÇÃO: o gatilho é um botão com `+`, e a lista serve para escolher sobre o que a ação vai
 * agir. Nada fica selecionado depois, porque nada foi selecionado: uma rubrica foi criada.
 *
 * **Não é `DropdownMenu` + `Command`, e a diferença é de biblioteca.** O `command` do registry
 * traz o `cmdk`, que tem navegação por teclado e typeahead próprios; dentro de um menu do Base
 * UI seriam duas bibliotecas disputando as setas no mesmo popup. O `Combobox` do Base UI —
 * este, que o projeto já usa — É busca mais lista mais teclado, então o "command" já está aqui
 * sem a segunda dependência.
 *
 * O painel controla o próprio `open` porque a escolha não muda o valor: sem `value` para
 * mudar, o componente não tem como saber que a ação terminou e fecharia só no clique fora.
 */
export function AddRubricButton({ options, onPick }: { options: CategoryChoice[]; onPick: (categoryId: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Combobox
      items={options}
      // Realce automático no primeiro casamento: sem isto, digitar "saude" e apertar Enter
      // FECHAVA o painel sem criar nada — nenhum item estava realçado, então o Enter não tinha
      // o que escolher. Um no-op silencioso num controle de busca é pior que um erro.
      autoHighlight
      open={open}
      onOpenChange={setOpen}
      // Nunca guarda seleção: é o que impede o ✓ de aparecer e o gatilho de virar um valor.
      value={null}
      onValueChange={(item: CategoryChoice | null) => {
        if (!item) return
        onPick(item.value)
        setOpen(false)
      }}
      itemToStringLabel={(item: CategoryChoice) => item.label}
      isItemEqualToValue={(a: CategoryChoice, b: CategoryChoice) => a.value === b.value}
      // A descrição entra na BUSCA e não só na tela: com ela fora do casamento, digitar
      // "padaria" deixaria de encontrar "Mercado", que é justamente para o que ela serve.
      filter={(item: CategoryChoice, query: string) => query.trim() === '' || fold(`${item.label} ${item.description ?? ''}`).includes(fold(query.trim()))}
    >
      {/* Primário, sem `variant`: é a ação da tela, e é a única. O `Button` já nasce assim. */}
      <ComboboxTrigger aria-label="Adicionar rubrica de uma categoria" render={<Button />}>
        <Plus data-icon="inline-start" /> Adicionar rubrica
      </ComboboxTrigger>
      {/* Largura própria: o painel do registry herda a do gatilho (`w-(--anchor-width)`), e o
          gatilho aqui é um botão compacto — herdada, a lista sairia com a largura do texto do
          botão. */}
      <ComboboxContent className="w-72">
        <ComboboxInput placeholder="Buscar categoria…" showTrigger={false} />
        <ComboboxEmpty>Nenhuma categoria corresponde à busca</ComboboxEmpty>
        <ComboboxList>
          {(item: CategoryChoice) => (
            /* Rótulo e descrição em DUAS LINHAS, e não em duas colunas. Em colunas, a descrição
               — que aqui é uma frase inteira — roubava a largura do rótulo, e a lista mostrava
               "T…" e "S…" no lugar de "Transporte" e "Saúde"; uma linha chegou a aparecer só
               com a descrição, sem nome nenhum. O nome é por onde se escolhe: ele não trunca. */
            <ComboboxItem key={item.value} value={item} className="items-start py-1.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{item.label}</span>
                {item.description ? <span className="truncate text-[0.6875rem] text-muted-foreground">{item.description}</span> : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
