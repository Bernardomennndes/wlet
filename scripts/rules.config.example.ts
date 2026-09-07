import type { Rule } from './rules.ts'

/**
 * MODELO — copie para `rules.config.ts` (ignorado pelo git). `pnpm run setup` faz isso.
 *
 * Aqui ficam as SUAS regras de categorização: o comércio do seu bairro, os seus clientes,
 * a sua cidade. Elas não são versionadas porque a lista de onde alguém compra pão descreve
 * a pessoa tanto quanto o extrato — as genéricas, essas sim, ficam em `rules.ts`.
 *
 * São consultadas ANTES das genéricas, porque a primeira que casa vence e o nome específico
 * precisa poder ganhar da palavra-chave: sem isso, `MERCADO DO SEU JOÃO` nunca chegaria a
 * uma regra própria, porque o `MERCADO ` genérico casaria primeiro.
 *
 * O texto testado é a descrição normalizada: maiúsculas, sem acentos, sem prefixo de
 * adquirente (IFD, DM, MP, DL). Categorias válidas estão em `src/data/categories.ts`.
 * Depois de editar, rode `pnpm ingest` — o relatório lista o que ficou sem categoria.
 */
export const CUSTOM_RULES: Rule[] = [
  // ---- Renda: quem te paga ----
  { id: 'cliente-principal', test: /NOME DO CLIENTE NO EXTRATO/, category: 'receita-pj', merchant: 'Cliente Principal', sign: 'in' },

  // ---- Moradia: quem cobra o aluguel e as contas ----
  { id: 'imobiliaria', test: /NOME DA IMOBILIARIA/, category: 'moradia', merchant: 'Aluguel' },

  // ---- Mercado: o supermercado da esquina, que nenhuma palavra-chave pega ----
  { id: 'mercado-local', test: /NOME DO MERCADO|OUTRO MERCADO/, category: 'mercado' },
]
