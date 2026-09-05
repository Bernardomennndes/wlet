import type { AccountType, Entity } from '../src/data/types.ts'

/**
 * MODELO — copie para `accounts.config.ts` (que é ignorado pelo git) e troque pelos seus
 * dados. `pnpm setup` faz essa cópia para você.
 *
 * Registro de contas conhecidas. A identificação é feita pelos metadados do próprio arquivo
 * (código do banco + tipo de conta + trecho do caminho). Uma conta que não esteja aqui é
 * criada automaticamente com um nome genérico e um aviso no terminal.
 *
 * `holder` só aparece na tela de Contas. `externalId` é opcional e só serve para desempatar
 * duas contas do mesmo banco e do mesmo tipo — com um banco por tipo, ele não é necessário.
 */
export interface AccountProfile {
  id: string
  name: string
  bank: string
  bankCode: string
  type: AccountType
  entity: Entity
  holder: string
  /** Como reconhecer a conta a partir do arquivo. */
  match: {
    bankCode?: string
    externalId?: string | RegExp
    accountType?: AccountType
    /** Fallback: trecho do caminho do arquivo. */
    pathIncludes?: string
  }
}

export const ACCOUNT_PROFILES: AccountProfile[] = [
  {
    id: 'inter-pj',
    name: 'Inter PJ',
    bank: 'Banco Inter',
    bankCode: '077',
    type: 'checking',
    entity: 'PJ',
    holder: 'Sua Empresa Ltda',
    match: { bankCode: '077', accountType: 'checking' },
  },
  {
    id: 'nubank-conta',
    name: 'Nubank Conta',
    bank: 'Nubank',
    bankCode: '260',
    type: 'checking',
    entity: 'PF',
    holder: 'Seu Nome',
    match: { bankCode: '260', accountType: 'checking' },
  },
  {
    id: 'nubank-cartao',
    name: 'Nubank Cartão',
    bank: 'Nubank',
    bankCode: '260',
    type: 'credit-card',
    entity: 'PF',
    holder: 'Seu Nome',
    match: { bankCode: '260', accountType: 'credit-card' },
  },
  {
    id: 'xp-conta',
    name: 'XP Conta',
    bank: 'Banco XP',
    bankCode: '348',
    type: 'checking',
    entity: 'PF',
    holder: 'Seu Nome',
    match: { bankCode: '348', accountType: 'checking' },
  },
  {
    id: 'xp-cartao',
    name: 'XP Cartão',
    bank: 'Banco XP',
    bankCode: '348',
    type: 'credit-card',
    entity: 'PF',
    holder: 'Seu Nome',
    match: { bankCode: '348', accountType: 'credit-card', pathIncludes: 'fatura/xp' },
  },
  {
    id: 'xp-investimentos',
    name: 'XP Investimentos',
    bank: 'Banco XP',
    bankCode: '348',
    type: 'investment',
    entity: 'PF',
    holder: 'Seu Nome',
    // Conta virtual: não há extrato, ela só aparece como contraparte de aportes/resgates.
    match: { externalId: '__virtual_xp_invest__' },
  },
]

/**
 * Nomes que identificam o próprio titular nas descrições de transferência. É o que permite
 * reconhecer um Pix entre contas suas como transferência, e não como receita ou despesa.
 */
export const SELF_NAME_PATTERNS: RegExp[] = [/seu\s+nome/i]
