import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@wlet/ui/components/button'
import { Field, FieldError, FieldLabel } from '@wlet/ui/components/field'
import { Input } from '@wlet/ui/components/input'
import { entrarFormSchema as schema, type EntrarFormValues } from './entrar-form-schema'

/**
 * O formulário de entrada e de cadastro — um só, com um modo.
 *
 * São DOIS procedimentos do Better Auth (`signIn.email` e `signUp.email`) e um formulário: os
 * campos são os mesmos, e duas telas obrigariam a pessoa a descobrir em qual delas está antes de
 * digitar. O que muda é o rótulo do botão e a presença do nome.
 *
 * O schema e a razão do mínimo de senha vivem em `entrar-form-schema.ts`, num `.ts` irmão: é o que
 * permite testá-lo sem montar React, como a `form-output-contract.md` §1.1 pede.
 */

export function EntrarForm({ modo, enviando, onSubmit }: { modo: 'entrar' | 'cadastrar'; enviando: boolean; onSubmit: (values: EntrarFormValues) => void }) {
  const { register, handleSubmit, formState } = useForm<EntrarFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {modo === 'cadastrar' && (
        <Field>
          <FieldLabel htmlFor="entrar-nome">Nome</FieldLabel>
          <Input id="entrar-nome" autoComplete="name" placeholder="Como te chamar" {...register('name')} />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="entrar-email">E-mail</FieldLabel>
        {/* `autoComplete` correto não é detalhe: é o que faz o gerenciador de senhas do
            navegador preencher e, no cadastro, oferecer guardar a senha nova. */}
        <Input id="entrar-email" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register('email')} />
        <FieldError errors={[formState.errors.email]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="entrar-senha">Senha</FieldLabel>
        <Input id="entrar-senha" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} {...register('password')} />
        <FieldError errors={[formState.errors.password]} />
      </Field>

      {/* O pending vai no controle que disparou, e não num aviso à parte — §5.2 da
          `data-fetching.md`. Aqui ainda não há mutation: `enviando` vem da tela. */}
      <Button type="submit" size="lg" disabled={enviando}>
        {enviando ? 'Entrando…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
      </Button>
    </form>
  )
}
