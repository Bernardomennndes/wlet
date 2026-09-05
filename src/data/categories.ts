import type { EnumOption } from './types'

export type CategoryKind = 'income' | 'expense' | 'transfer'

export type CategoryGroup = 'income' | 'essentials' | 'lifestyle' | 'business' | 'obligations' | 'transfers'

/**
 * As faces do grupo numa lista só, tipada pelo enum: grupo novo no tipo vira erro de
 * compilação aqui. Um mapa só-de-rótulo ao lado do tipo é a forma que diverge em silêncio,
 * porque nada obriga os dois a andarem juntos.
 */
export const categoriesGroups: EnumOption<CategoryGroup>[] = [
  { value: 'income', label: 'Renda' },
  { value: 'essentials', label: 'Essenciais' },
  { value: 'lifestyle', label: 'Estilo de vida' },
  { value: 'business', label: 'Negócio' },
  { value: 'obligations', label: 'Obrigações' },
  { value: 'transfers', label: 'Movimentações' },
]

const GROUP_OPTIONS = new Map(categoriesGroups.map((option) => [option.value, option]))

/** Rótulo de tela do grupo. Grupo desconhecido cai na chave crua, nunca em texto vazio. */
export function categoryGroupLabel(group: CategoryGroup): string {
  return GROUP_OPTIONS.get(group)?.label ?? group
}

export interface Category {
  id: string
  label: string
  kind: CategoryKind
  /** Grupo de exibição para agrupar categorias no painel. Rótulo pt-BR em `categoriesGroups`. */
  group: CategoryGroup
  description: string
}

export const CATEGORIES: Category[] = [
  // Renda
  { id: 'receita-pj', label: 'Receita PJ', kind: 'income', group: 'income', description: 'Faturamento recebido de clientes na conta PJ' },
  { id: 'renda-pf', label: 'Renda PF', kind: 'income', group: 'income', description: 'Salário, pró-labore e rendas recebidas na pessoa física' },
  { id: 'pix-recebido', label: 'Pix de pessoas', kind: 'income', group: 'income', description: 'Transferências recebidas de terceiros' },
  { id: 'rendimentos', label: 'Rendimentos', kind: 'income', group: 'income', description: 'Juros e rendimento de saldo' },
  { id: 'reembolso', label: 'Estornos e créditos', kind: 'income', group: 'income', description: 'Estornos, cashback e créditos diversos' },
  { id: 'retirada-pj', label: 'Retirada da PJ', kind: 'income', group: 'income', description: 'Pró-labore e distribuição recebidos da empresa (visão PF)' },

  // Essenciais
  { id: 'moradia', label: 'Moradia', kind: 'expense', group: 'essentials', description: 'Aluguel, fiança, luz, água, gás' },
  { id: 'mercado', label: 'Mercado', kind: 'expense', group: 'essentials', description: 'Supermercados, padarias e hortifruti' },
  { id: 'transporte', label: 'Transporte', kind: 'expense', group: 'essentials', description: 'Uber, combustível e deslocamentos' },
  { id: 'saude', label: 'Saúde e bem-estar', kind: 'expense', group: 'essentials', description: 'Plano de saúde, farmácia, academia' },
  { id: 'telefonia', label: 'Telefonia', kind: 'expense', group: 'essentials', description: 'Recargas e operadora' },
  { id: 'educacao', label: 'Educação', kind: 'expense', group: 'essentials', description: 'Cursos e escolas de idioma' },
  { id: 'pets', label: 'Pets', kind: 'expense', group: 'essentials', description: 'Pet shop e veterinário' },

  // Estilo de vida
  { id: 'restaurantes', label: 'Restaurantes e delivery', kind: 'expense', group: 'lifestyle', description: 'iFood, bares, lanchonetes, restaurantes' },
  { id: 'assinaturas', label: 'Assinaturas', kind: 'expense', group: 'lifestyle', description: 'Streaming, apps e clubes' },
  { id: 'compras', label: 'Compras', kind: 'expense', group: 'lifestyle', description: 'E-commerce, roupas, eletrônicos' },
  { id: 'lazer', label: 'Lazer', kind: 'expense', group: 'lifestyle', description: 'Cinema, eventos, ingressos, bebidas' },
  { id: 'viagens', label: 'Viagens', kind: 'expense', group: 'lifestyle', description: 'Passagens, hospedagem, aeroporto' },
  { id: 'pix-pessoas', label: 'Pix para pessoas', kind: 'expense', group: 'lifestyle', description: 'Transferências enviadas a terceiros' },
  { id: 'presentes-doacoes', label: 'Presentes e doações', kind: 'expense', group: 'lifestyle', description: 'Igreja, doações e presentes' },

  // Negócio
  { id: 'tecnologia', label: 'Tecnologia e infra', kind: 'expense', group: 'business', description: 'Cloud, APIs, IA, hospedagem' },
  { id: 'marketing', label: 'Marketing e anúncios', kind: 'expense', group: 'business', description: 'Meta Ads e ferramentas de marketing' },
  { id: 'contabilidade', label: 'Contabilidade', kind: 'expense', group: 'business', description: 'Escritório contábil' },
  { id: 'retirada-pf', label: 'Retirada para o sócio', kind: 'expense', group: 'business', description: 'Pró-labore e distribuição pagos à pessoa física (visão PJ)' },

  // Obrigações
  { id: 'impostos', label: 'Impostos e taxas', kind: 'expense', group: 'obligations', description: 'DARF, DAS, IPVA, taxas municipais' },
  { id: 'juros-multas', label: 'Juros, multas e IOF', kind: 'expense', group: 'obligations', description: 'Custos financeiros evitáveis' },
  { id: 'servicos-financeiros', label: 'Serviços financeiros', kind: 'expense', group: 'obligations', description: 'Boletos de cobrança e tarifas' },

  // Movimentações
  { id: 'transferencia', label: 'Transferência entre contas', kind: 'transfer', group: 'transfers', description: 'Dinheiro movido entre suas próprias contas' },
  { id: 'pagamento-fatura', label: 'Pagamento de fatura', kind: 'transfer', group: 'transfers', description: 'Quitação do cartão de crédito' },
  { id: 'investimentos', label: 'Investimentos', kind: 'transfer', group: 'transfers', description: 'Aportes e resgates da conta investimento' },

  { id: 'outros', label: 'Outros', kind: 'expense', group: 'lifestyle', description: 'Não classificado' },
]

export const CATEGORY_MAP: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

export function categoryLabel(id: string): string {
  return CATEGORY_MAP[id]?.label ?? id
}
