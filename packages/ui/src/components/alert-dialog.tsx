import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from 'cn'

import { Button } from './button'

/**
 * O diálogo que PERGUNTA antes de uma ação instantânea acontecer.
 *
 * **Ele não é o `Dialog` com outro nome, e essa é a razão de existir como arquivo.** Três
 * diferenças, e cada uma existe para um modo de erro concreto:
 *
 * 1. **`role="alertdialog"`.** Um leitor de tela anuncia um alertdialog interrompendo o que estava
 *    lendo, e lê o título e a descrição junto. Como `dialog` comum, quem não vê a tela descobre que
 *    havia uma pergunta ao tabular até o botão.
 * 2. **O foco inicial vai no CANCELAR.** Num diálogo comum o foco cai no primeiro elemento, que
 *    aqui seria a confirmação — e um Enter reflexo executaria exatamente o que se quis confirmar.
 *    O `initialFocus` recebe o ref do próprio `AlertDialogCancel`, registrado por contexto: sem
 *    isso, o componente teria de adivinhar qual botão é o de recuo.
 * 3. **Não fecha ao clicar fora** (`disablePointerDismissal`). Fechar por clique acidental é
 *    ambíguo: não se sabe se a pessoa desistiu ou errou o alvo, e num diálogo de exclusão a
 *    ambiguidade custa o dado.
 *
 * Sem botão de fechar no canto, de propósito: a saída é o Cancelar, que está no rodapé e tem nome.
 */
const CancelRefContext = React.createContext<React.RefObject<HTMLButtonElement | null> | null>(null)

function AlertDialog({ disablePointerDismissal = true, ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="alert-dialog" disablePointerDismissal={disablePointerDismissal} {...props} />
}

function AlertDialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  const cancelRef = React.useRef<HTMLButtonElement | null>(null)
  return (
    <CancelRefContext.Provider value={cancelRef}>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <DialogPrimitive.Popup
          data-slot="alert-dialog-content"
          role="alertdialog"
          initialFocus={cancelRef}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-xs/relaxed text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </AlertDialogPortal>
    </CancelRefContext.Provider>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-header" className={cn('flex flex-col gap-1', className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="alert-dialog-title" className={cn('font-heading text-sm font-medium', className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="alert-dialog-description" className={cn('text-xs/relaxed text-muted-foreground', className)} {...props} />
}

/** O recuo. Registra o próprio ref para o `initialFocus` do conteúdo poder apontar para ele. */
function AlertDialogCancel({ children = 'Cancelar', ...props }: DialogPrimitive.Close.Props) {
  const ref = React.useContext(CancelRefContext)
  return (
    <DialogPrimitive.Close data-slot="alert-dialog-cancel" render={<Button ref={ref ?? undefined} variant="outline" />} {...props}>
      {children}
    </DialogPrimitive.Close>
  )
}

/**
 * A confirmação. FECHA e dispara — nesta ordem, pelo próprio `Close`.
 *
 * `variant` fica aberto porque a ação varia: `destructive` para excluir, o padrão para aprovar.
 * Quem decide é quem escreve a pergunta.
 */
function AlertDialogAction({ variant = 'default', ...props }: DialogPrimitive.Close.Props & { variant?: 'default' | 'destructive' }) {
  return <DialogPrimitive.Close data-slot="alert-dialog-action" render={<Button variant={variant} />} {...props} />
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
