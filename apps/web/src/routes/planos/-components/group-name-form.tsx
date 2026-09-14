import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from '@phosphor-icons/react'
import type { PlanGroup } from '@wlet/domain'
import { Button } from '@wlet/ui/components/button'
import { FieldError } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@wlet/ui/components/tooltip'
import { type KeyboardEvent as ReactKeyboardEvent, useState } from 'react'
import { useForm } from 'react-hook-form'
import { type GroupNameFormValues, groupNameFormSchema } from './group-name-form-schema'

/**
 * O nome de um grupo, que se edita na própria linha.
 *
 * Em repouso é TEXTO, com um lápis que só aparece quando a linha do grupo é apontada (ou alcançada
 * pelo teclado — o botão continua focável com `opacity-0`, o mesmo idioma da lixeira ao lado). Um
 * campo sempre montado faria as linhas de grupo parecerem formulários abertos.
 *
 * O hover só REVELA a ação, não abre o campo: editar ao apontar faria qualquer travessia do cursor
 * pela tabela abrir e fechar campos.
 */
export function GroupNameForm({ group, disabled, onRename }: { group: PlanGroup; disabled: boolean; onRename: (label: string) => void }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <GroupNameEditor
        group={group}
        onDone={(label) => {
          setEditing(false)
          // Sair sem mudar nada não é gravação: sem esta guarda, abrir e fechar o campo levantaria
          // `saving` na tela inteira sem número novo nenhum.
          if (label !== undefined && label !== group.label) onRename(label)
        }}
      />
    )
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{group.label}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Renomear o grupo ${group.label}`}
              className="opacity-0 group-hover/bucket:opacity-100 group-focus-within/bucket:opacity-100"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          }
        />
        <TooltipContent>Renomear o grupo</TooltipContent>
      </Tooltip>
    </span>
  )
}

/**
 * O campo aberto. É componente próprio para o `useForm` nascer a cada abertura com o nome ATUAL,
 * sem um efeito de `reset` observando `editing`.
 *
 * **O BLUR é o único caminho que fecha o campo**, e é isso que dispensa trava contra gravar duas
 * vezes. Enter valida e, se o nome serve, tira o foco — quem grava é o blur que isso dispara; com o
 * nome vazio o erro aparece e o foco fica. Esc devolve o nome original ao campo e tira o foco: o
 * blur fecha sem gravar, porque nada mudou. Sair do campo com o nome vazio devolve o nome antigo —
 * a pessoa foi embora, e prendê-la num campo que ela já largou seria pior que desfazer.
 *
 * **O campo nunca é desabilitado**, pela razão que o `CLAUDE.md` mediu em Rubricas: elemento
 * desabilitado perde o foco.
 */
function GroupNameEditor({ group, onDone }: { group: PlanGroup; onDone: (label?: string) => void }) {
  // Entrada, contexto e SAÍDA: o `handleSubmit` entrega o que o `.transform()` produziu.
  const { register, handleSubmit, trigger, setValue, formState } = useForm<GroupNameFormValues, unknown, Pick<PlanGroup, 'label'>>({
    resolver: zodResolver(groupNameFormSchema),
    defaultValues: { label: group.label },
  })

  const onKeyDown = async (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    if (event.key === 'Escape') {
      event.preventDefault()
      setValue('label', group.label)
      input.blur()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (await trigger('label')) input.blur()
  }

  return (
    // Sem botão de submit: quem grava é o blur, e o submit nativo do Enter é contido no `onKeyDown`.
    <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-0.5">
      <Input
        autoFocus
        autoComplete="off"
        aria-label={`Nome do grupo ${group.label}`}
        aria-invalid={Boolean(formState.errors.label)}
        className="max-w-80"
        onKeyDown={onKeyDown}
        onFocus={(event) => event.currentTarget.select()}
        {...register('label', {
          onBlur: () =>
            void handleSubmit(
              ({ label }) => onDone(label),
              () => onDone(),
            )(),
        })}
      />
      <FieldError errors={[formState.errors.label]} />
    </form>
  )
}
