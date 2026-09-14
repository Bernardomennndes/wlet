import { zodResolver } from '@hookform/resolvers/zod'
import type { PlanGroup } from '@wlet/domain'
import { FieldError } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { type GroupNameFormValues, groupNameFormSchema } from './group-name-form-schema'

/**
 * O campo que renomeia um grupo, aberto na própria linha.
 *
 * Quem decide QUANDO ele aparece é o bloco do grupo (`planos-data-table.tsx`): o lápis mora na
 * coluna de ações, ao lado da lixeira, e o campo toma o lugar do nome. Este componente só existe
 * enquanto se edita, e é por isso que o `useForm` nasce a cada abertura com o nome ATUAL, sem um
 * efeito de `reset`.
 *
 * **O BLUR é o único caminho que fecha o campo**, e é isso que dispensa trava contra gravar duas
 * vezes. Enter valida e, se o nome serve, tira o foco — quem grava é o blur que isso dispara; com o
 * nome vazio o erro aparece e o foco fica. Esc devolve o nome original ao campo e tira o foco: o
 * blur fecha sem mudança. Sair do campo com o nome vazio devolve o nome antigo — a pessoa foi
 * embora, e prendê-la num campo que ela já largou seria pior que desfazer.
 *
 * `onDone` recebe o nome quando ele passou na validação, e nada quando a edição foi desfeita. Quem
 * compara com o nome atual e decide se grava é o bloco.
 *
 * **O campo nunca é desabilitado**, pela razão que o `CLAUDE.md` mediu em Rubricas: elemento
 * desabilitado perde o foco.
 */
export function GroupNameForm({ group, onDone }: { group: PlanGroup; onDone: (label?: string) => void }) {
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
