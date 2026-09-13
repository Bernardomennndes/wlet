import { RemoveButton } from '@/components/remove-button'
import { Plus } from '@phosphor-icons/react'
import { AppCombobox } from '@wlet/ui/components/app-combobox'
import { Button } from '@wlet/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wlet/ui/components/card'
import { Input } from '@wlet/ui/components/input'
import { newId, accountsTypes, entityKinds, type AccountType, type Entity } from '@wlet/domain'
import type { AccountProfile } from '@wlet/ingest/pipeline'

const TYPE_ITEMS = accountsTypes.map((t) => ({ value: t.value, label: t.label }))
const ENTITY_ITEMS = entityKinds.map((e) => ({ value: e.value, label: e.label }))

/**
 * Como reconhecer cada conta a partir do arquivo.
 *
 * A identificação é por METADADO do próprio arquivo — código do banco, tipo de conta, trecho
 * do caminho —, nunca pelo nome do arquivo, que muda a cada exportação. Uma conta que não casa
 * com nenhum perfil é CRIADA automaticamente com nome genérico, e o relatório avisa: o
 * pipeline nunca descarta um extrato por não saber de quem ele é.
 *
 * `pathIncludes` é o que separa fatura de extrato do MESMO banco — sem ele, o cartão da XP e a
 * conta da XP têm os mesmos metadados e o segundo arquivo lido sobrescreve o primeiro.
 */
export function AccountsSection({ accounts, onChange, disabled }: { accounts: AccountProfile[]; onChange: (next: AccountProfile[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<AccountProfile>) => onChange(accounts.map((a, i) => (i === index ? { ...a, ...change } : a)))
  const patchMatch = (index: number, change: Partial<AccountProfile['match']>) => patch(index, { match: { ...accounts[index].match, ...change } })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Perfis de conta</CardTitle>
        <CardDescription>A conta é reconhecida pelos metadados do arquivo, não pelo nome dele. Sem perfil, ela é criada sozinha e o relatório avisa. Mudá-los exige reprocessar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {accounts.map((account, index) => (
          <div key={account.id} className="space-y-2 border-l-2 pl-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Identificador</span>
                <Input value={account.id} disabled={disabled} className="w-36 font-mono" onChange={(e) => patch(index, { id: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Nome na tela</span>
                <Input value={account.name} disabled={disabled} className="w-44" onChange={(e) => patch(index, { name: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Banco</span>
                <Input value={account.bank} disabled={disabled} className="w-36" onChange={(e) => patch(index, { bank: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Titular</span>
                <Input value={account.holder} disabled={disabled} className="w-40" onChange={(e) => patch(index, { holder: e.target.value })} />
              </label>
              <RemoveButton
                label={`Remover o perfil ${account.name}`}
                title="Remover este perfil de conta?"
                description={`${account.name} deixa de ser reconhecida na leitura dos extratos. Os lançamentos já lidos continuam onde estão, mas a próxima leitura não saberá de que conta o arquivo é.`}
                disabled={disabled}
                onConfirm={() => onChange(accounts.filter((_, i) => i !== index))}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-muted-foreground block">Recorte</span>
                <AppCombobox items={ENTITY_ITEMS} value={account.entity} onValueChange={(v) => patch(index, { entity: v as Entity })} aria-label="Recorte da conta" className="w-40" />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Tipo</span>
                <AppCombobox items={TYPE_ITEMS} value={account.type} onValueChange={(v) => patch(index, { type: v as AccountType })} aria-label="Tipo da conta" className="w-44" />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Código do banco</span>
                <Input
                  value={account.bankCode}
                  disabled={disabled}
                  className="w-24 font-mono"
                  onChange={(e) => patch(index, { bankCode: e.target.value, match: { ...account.match, bankCode: e.target.value } })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground block">Trecho do caminho</span>
                <Input
                  value={account.match.pathIncludes ?? ''}
                  disabled={disabled}
                  className="w-44 font-mono"
                  placeholder="fatura/xp"
                  onChange={(e) => patchMatch(index, { pathIncludes: e.target.value || undefined })}
                />
              </label>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-muted-foreground">Nenhum perfil. As contas serão criadas a partir dos metadados dos arquivos, com nome genérico.</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...accounts, { id: newId('conta'), name: 'Nova conta', bank: '', bankCode: '', type: 'checking', entity: 'PF', holder: '', match: {} }])}
        >
          <Plus /> Adicionar perfil
        </Button>
      </CardContent>
    </Card>
  )
}
