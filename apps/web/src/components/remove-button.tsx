import { Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@wlet/ui/components/alert-dialog'
import { Button } from '@wlet/ui/components/button'

/**
 * A lixeira que PERGUNTA antes — o gesto de remover uma linha declarada.
 *
 * As quatro seções da Configuração removiam com um clique só: `onClick={() => onChange(lista.filter(…))}`,
 * e o pai grava a configuração inteira em seguida. É o que a §1 de `mutation-confirmation.md` proíbe
 * em letra — "qualquer clique único que já produz efeito no backend" —, e o que se perde num
 * deslize não volta: não há desfazer, e a cobrança tinha o casamento por contraparte, a conta tinha
 * o perfil de extrato, a regra tinha a expressão. Um toque errado apaga o que alguém digitou.
 *
 * O sensor de confirmação não as via, e o motivo é instrutivo: ele procura tela com `useMutation`
 * de nome destrutivo, e estas seções não têm mutação própria — elas chamam `onChange` para cima. A
 * ausência de mutação local não torna a ação menos destrutiva; só a esconde.
 *
 * **Componente, e não um `AlertDialog` copiado quatro vezes**, porque o estado do painel aberto é
 * consumido só por ele (§1 de `component-construction.md`): as seções continuam sem estado, que é o
 * que as mantém legíveis como listas de campos. As três propriedades que a confirmação precisa ter
 * — `role="alertdialog"`, foco inicial no Cancelar, e não fechar ao clicar fora — vêm do
 * `alert-dialog.tsx` do registry e estão medidas em `apps/web/scripts/checks/confirmation.test.ts`.
 */
export function RemoveButton({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: {
  /** O `aria-label` do botão: "Remover a cobrança de Mãe". Diz O QUE some, não só "remover". */
  label: string
  /** O título do painel, como pergunta: "Remover esta cobrança?" */
  title: string
  /** O EFEITO da remoção — o que sai e o que fica. É o que separa confirmar de adivinhar. */
  description: string
  disabled?: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={label} onClick={() => setOpen(true)}>
        <Trash />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction variant="destructive" onClick={onConfirm}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
