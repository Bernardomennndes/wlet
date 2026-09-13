/**
 * Regras de categorização. A primeira regra que casar vence, então a ordem
 * importa: regras específicas primeiro, genéricas depois.
 *
 * O texto testado é a descrição normalizada (maiúsculas, sem acentos, sem
 * prefixos de adquirente como IFD, DM, MP).
 *
 * Porte de `scripts/rules.ts` para o navegador. A única diferença é de ONDE vêm as suas
 * regras: lá o módulo importava `scripts/rules.config.ts`, que é dado pessoal, não é
 * versionado e não existe no navegador — aqui elas chegam por PARÂMETRO, em `buildRules`.
 * O resto é cópia fiel, inclusive a ordem das camadas, que é a regra.
 */

/**
 * O tipo é declarado aqui, e não em `@wlet/domain`, porque ele não é vocabulário de domínio:
 * é o contrato desta lista, e é dele que os `*.config` de regra dependem. Mesma posição do
 * original.
 */
export interface Rule {
  id: string
  test: RegExp
  category: string
  /** Nome amigável do estabelecimento, quando o texto bruto é ruim. */
  merchant?: string
  /** Só aplica quando o valor tem esse sinal. */
  sign?: 'in' | 'out'
}

/**
 * Regras que ganham de QUALQUER outra, inclusive das suas: movimentação interna e
 * plataforma intermediária. Um `IFD*` na frente diz que o pedido é do iFood — o nome do
 * restaurante vem depois, e não deve trocar a categoria nem o estabelecimento agrupado.
 */
export const PRIORITY_RULES: Rule[] = [
  { id: 'pagamento-fatura', test: /PAGAMENTO DE FATURA|PAGAMENTO RECEBIDO$/, category: 'pagamento-fatura' },
  { id: 'pix-credito', test: /PIX NO CREDITO|VALOR ADICIONADO NA CONTA POR CARTAO/, category: 'transferencia' },
  { id: 'nu-pagamentos', test: /PIX ENVIADO PARA NU PAGAMENTOS/, category: 'pagamento-fatura' },
  { id: 'conta-investimento', test: /CONTA INVESTIMENTO/, category: 'investimentos' },
  { id: 'rendimento', test: /RENDIMENTO AUTOMATICO|RENDIMENTOS?\b/, category: 'rendimentos', merchant: 'Rendimento da conta' },
  // Estas duas vêm ANTES do iFood de propósito: a farmácia entregue pelo app continua
  // sendo saúde, e a assinatura do clube não é uma refeição.
  { id: 'drogaria', test: /DROGARIA|DROGARIAS|FARMACIA|PACHECO/, category: 'saude', merchant: 'Farmácia' },
  { id: 'ifood-club', test: /IFOOD CLUB/, category: 'assinaturas', merchant: 'iFood Club' },
  { id: 'ifood', test: /^IFD|IFOOD|RAPPI/, category: 'restaurantes', merchant: 'iFood' },
]

/**
 * Regras genéricas: marcas nacionais, serviços conhecidos e palavra-chave de categoria.
 * Nada aqui identifica ninguém, então é o que viaja no repositório.
 */
export const BASE_RULES: Rule[] = [
  // ---- Obrigações ----
  { id: 'receita-federal', test: /RECEITA FEDERAL|DARF/, category: 'impostos', merchant: 'Receita Federal' },
  { id: 'prefeitura', test: /PREFEITURA|MUNICIPIO DE |SECRET\.? FAZENDA|ESTADO DE /, category: 'impostos' },
  { id: 'iof', test: /^IOF\b|IOF DE|IOF POR/, category: 'juros-multas' },
  { id: 'juros-multa', test: /JUROS|MULTA|SALDO EM ATRASO|VALOR PENDENTE DO MES ANTERIOR/, category: 'juros-multas' },
  { id: 'contabilizei', test: /CONTABILIZEI/, category: 'contabilidade', merchant: 'Contabilizei' },
  { id: 'pagar-me', test: /PAGAR ME|PAGARME|EBANX|CAKTO PAY/, category: 'servicos-financeiros' },

  // ---- Negócio ----
  { id: 'openai', test: /OPENAI/, category: 'tecnologia', merchant: 'OpenAI' },
  { id: 'anthropic', test: /ANTHROPIC|CLAUDE\.AI/, category: 'tecnologia', merchant: 'Anthropic (Claude)' },
  { id: 'aws', test: /AMAZON AWS|AMAZON WEB SERVICES/, category: 'tecnologia', merchant: 'Amazon AWS' },
  { id: 'vercel', test: /VERCEL/, category: 'tecnologia', merchant: 'Vercel' },
  { id: 'supabase', test: /SUPABASE/, category: 'tecnologia', merchant: 'Supabase' },
  { id: 'mongodb', test: /MONGODB/, category: 'tecnologia', merchant: 'MongoDB Atlas' },
  { id: 'google-cloud', test: /GOOGLE CLOUD/, category: 'tecnologia', merchant: 'Google Cloud' },
  { id: 'hostinger', test: /HOSTINGER/, category: 'tecnologia', merchant: 'Hostinger' },
  { id: 'uazapi', test: /UAZAPI/, category: 'tecnologia', merchant: 'Uazapi (API WhatsApp)' },
  { id: 'facebook-ads', test: /FACEBK|FACEBOOK|META PLATFORMS/, category: 'marketing', merchant: 'Meta Ads' },

  // ---- Moradia ----
  { id: 'aluguel', test: /ALUGUEL|IMOBILIARIA|CONDOMINIO|FIANCA/, category: 'moradia' },
  { id: 'utilidades', test: /ENERGIA|ELETRIC|SANEAMENTO|GAS E AGUA/, category: 'moradia' },

  // ---- Transporte ----
  { id: 'uber', test: /UBER|UBERRIDES|DL ?\*? ?RIDE$/, category: 'transporte', merchant: 'Uber' },
  { id: '99', test: /^99\*|\b99 ?RIDE|DL ?\*? ?99/, category: 'transporte', merchant: '99' },
  { id: 'posto', test: /POSTO|COMBUSTIVEL|AUTO POSTO/, category: 'transporte', merchant: 'Combustível' },
  { id: 'pedagio', test: /PEDAGIO|SEM PARAR|CONECTCAR|VELOE/, category: 'transporte' },

  // ---- Telefonia ----
  { id: 'recarga', test: /RECARGA DE CELULAR/, category: 'telefonia', merchant: 'Recarga de celular' },
  { id: 'telecom', test: /TELEFONICA|VIVO|CLARO|TIM |OI FIBRA|NET SERVICOS/, category: 'telefonia' },

  // ---- Saúde ----
  { id: 'manual', test: /MANUAL SAUDE|MANUAL ASSINATUR/, category: 'saude', merchant: 'Manual (saúde)' },
  { id: 'academia', test: /WELLHUB|GYMPASS|ACADEMIA|SMART ?FIT/, category: 'saude', merchant: 'Academia' },
  // Suplementação saiu de `saude`: quem faz dieta planeja os dois separadamente, e somados
  // numa categoria só a rubrica de um esconde o estouro do outro.
  { id: 'suplementos', test: /GROWTH SUPPLEMENTS|SUPLEMENTOS|MAX ?TITANIUM|INTEGRALMEDICA|PROBIOTICA|DARKNESS|NUTRATA|BLACK ?SKULL|WHEY|CREATINA/, category: 'suplementacao', merchant: 'Suplementos' },
  { id: 'consulta', test: /CLINICA|LABORATORIO DE ANALISES|ODONTO|HOSPITAL|PLANO DE SAUDE|UNIMED/, category: 'saude' },

  // ---- Pets ----
  { id: 'pet', test: /PET SHOP|PETZ|COBASI|VETERINARI/, category: 'pets', merchant: 'Pet shop' },

  // ---- Assinaturas ----
  { id: 'spotify', test: /SPOTIFY/, category: 'assinaturas', merchant: 'Spotify' },
  { id: 'apple', test: /APPLE\.COM/, category: 'assinaturas', merchant: 'Apple' },
  { id: 'streaming', test: /NETFLIX|DISNEY PLUS|HBO|MAX\.COM|PRIME VIDEO|YOUTUBE PREMIUM/, category: 'assinaturas' },
  { id: 'livelo', test: /LIVELO/, category: 'assinaturas', merchant: 'Livelo' },

  // ---- Viagens ----
  { id: 'airbnb', test: /AIRBNB/, category: 'viagens', merchant: 'Airbnb' },
  { id: 'aereo', test: /AEROLINEAS|GOL LINHAS|LATAM|AZUL LINHAS|AIRPORT/, category: 'viagens' },
  { id: 'hospedagem', test: /POUSADA|HOTEL/, category: 'viagens' },
  { id: 'correios', test: /CORREIOS/, category: 'compras', merchant: 'Correios' },

  // ---- Mercado ----
  { id: 'supermercado', test: /SUPERMERCADO|MERCADO |HIPERMERCADO|ATACAD/, category: 'mercado' },
  { id: 'padaria', test: /PADARIA|HORTIFRUTI|ACOUGUE|ADEGA|DISTRIBUIDORA/, category: 'mercado' },

  // ---- Lazer ----
  { id: 'cinema', test: /CINEMA|MOVIESYSTEM/, category: 'lazer', merchant: 'Cinema' },
  // `BAR` sozinho não entra: `SUSHI BAR` e `SNACK BAR` são restaurante, e a regra de
  // lazer vem antes da de restaurantes — a palavra roubaria as duas.
  { id: 'eventos', test: /ZIG\*|TICKET|INGRESSO|SYMPLA|GASTROBAR|CERVEJARIA|BOTECO|PUB$/, category: 'lazer' },

  // ---- Compras ----
  {
    id: 'ecommerce',
    test: /SHOPEE|MERCADOLIVRE|MERCADO LIVRE|MERCADOPAGO|AMAZON|AMERICANAS|RENNER|CENTAURO|NIKE|ADIDAS|MAGAZINE ?LUIZA|ALIEXPRESS|LOJAS/,
    category: 'compras',
  },

  // ---- Restaurantes e delivery ----
  {
    id: 'restaurantes',
    test: /RESTAURANTE|BURGUER|BURGER|PIZZA|PIZZARIA|LANCHES|LANCHONETE|ACAI|SUSHI|ESFIHA|SORVETE|GELATO|CAFE|BISTRO|CACAU SHOW|CHURROS|DONER|JAPAN FOOD|MASSAS|GRELH|ESPETINHO|FOODS|ALIMENT|DOMINOS|SUBWAY|MC ?DONALDS|BURGER KING/,
    category: 'restaurantes',
  },

  // ---- Presentes e doações ----
  { id: 'doacoes', test: /PAROQUIA|IGREJA|DIZIMO|DOACAO|ONG /, category: 'presentes-doacoes' },

  // ---- Pix genéricos (fallback por padrão de texto) ----
  { id: 'pix-recebido', test: /^PIX RECEBIDO|TRANSFERENCIA RECEBIDA PELO PIX|TED RECEBIDA|^TED RECEBIDA/, category: 'pix-recebido', sign: 'in' },
  { id: 'pix-enviado', test: /^PIX ENVIADO|TRANSFERENCIA ENVIADA PELO PIX/, category: 'pix-pessoas', sign: 'out' },
  { id: 'debito-conta', test: /^DEBITO EM CONTA/, category: 'servicos-financeiros', merchant: 'Débito em conta' },
]

/**
 * A lista que o ingest consulta, em três camadas. A primeira que casa vence, então a ordem
 * É a regra: o que é movimentação interna ou plataforma ganha de tudo; depois as suas
 * regras, porque `MERCADO DO SEU JOÃO` precisa poder ganhar do genérico `MERCADO `; por
 * último as palavras-chave.
 *
 * No original a camada do meio era um IMPORT de `scripts/rules.config.ts` e a lista pronta
 * era a constante `RULES`. Aqui ela é PARÂMETRO: o config é dado pessoal, mora fora do
 * repositório e não existe no navegador — quem sabe carregá-lo é o adaptador. Sem regras
 * suas a lista continua válida, só sem a camada específica; é o que um clone novo tem.
 */
export function buildRules(customRules: Rule[] = []): Rule[] {
  return [...PRIORITY_RULES, ...customRules, ...BASE_RULES]
}

/**
 * A categoria de um lançamento: a PRIMEIRA regra que casar vence.
 *
 * Morava no `pipeline.ts`, privada, e por isso o motor de categorização do app inteiro não tinha
 * como ser exercitado. É pura — recebe as regras, o texto normalizado e o valor — e pertence aqui,
 * ao lado das listas que ela percorre: o módulo que declara as regras é o que sabe aplicá-las.
 *
 * **O `sign` é filtro, não desempate.** Uma regra marcada `out` não casa uma entrada, e a busca
 * CONTINUA — ela não interrompe. Sem isso, "JUROS" pegaria tanto o juro cobrado quanto o
 * rendimento creditado, e os dois cairiam em `juros-multas`.
 *
 * **O padrão de quem não casou nada depende do SINAL, e é decisão de modelo.** Saída sem regra é
 * `outros`; entrada sem regra é `reembolso` — que neste app ABATE uma despesa em vez de contar como
 * receita. Tratar entrada desconhecida como receita inflaria o que entrou toda vez que alguém
 * devolvesse um rateio.
 */
export function categorize(rules: Rule[], normalized: string, amount: number): { categoryId: string; rule: string | null; merchant: string | null } {
  for (const rule of rules) {
    if (rule.sign === 'in' && amount < 0) continue
    if (rule.sign === 'out' && amount > 0) continue
    if (rule.test.test(normalized)) return { categoryId: rule.category, rule: rule.id, merchant: rule.merchant ?? null }
  }
  return { categoryId: amount > 0 ? 'reembolso' : 'outros', rule: null, merchant: null }
}

/** Prefixos de adquirentes/plataformas que poluem a descrição. */
const PREFIXES = /^(IFD\*|DM\*|MP\*|DL ?\*|EC ?\*|B\*|ZIG\*|APP\s+\*|SHOPEE \*|MERCADOLIVRE\*|CREDPAG\*|JIM\.COM\*?|MERCADOPAGO\*|AIRBNB PAGAM\*|FACEBK \*)\s*/i

export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeForRules(text: string): string {
  return stripAccents(text).toUpperCase().replace(/&AMP;/g, '&').replace(/\s+/g, ' ').trim()
}

/** Descrição limpa para exibição. */
export function cleanDescription(raw: string): string {
  let text = raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  // Inter: `Pix enviado: "Cp :00000000-Nome do Titular"` — o código antes do hífen não
  // diz nada a quem lê, e o nome é o que interessa.
  text = text.replace(/:\s*"Cp\s*:\d+-([^"]+)"/i, ': $1')
  // Nubank: remove CPF mascarado e dados bancários longos
  text = text.replace(/\s*-\s*•{3}\.\d{3}\.\d{3}-•{2}/g, '')
  text = text.replace(/\s*-\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '')
  // Sufixos de cidade/país nas compras XP em débito
  text = text.replace(/\s{2,}[A-Z ]+\s+BR$/i, '')
  return text.trim()
}

/** Nome do estabelecimento/contraparte para agrupar gastos. */
export function deriveMerchant(cleaned: string): string {
  let text = cleaned
  const pixOut = text.match(/^(?:Pix enviado(?: para)?|Transferência enviada pelo Pix)\s*[:-]?\s*(.+)$/i)
  const pixIn = text.match(/^(?:Pix recebido(?: de)?|Transferência recebida pelo Pix|TED recebida de)\s*[:-]?\s*(.+)$/i)
  const pay = text.match(/^Pagamento para (.+)$/i)
  const generic = text.match(/^(?:Pagamento PMSP-SF):\s*(.+)$/i)
  if (pixOut) text = pixOut[1]
  else if (pixIn) text = pixIn[1]
  else if (pay) text = pay[1]
  else if (generic) text = generic[1]

  // Nubank: "NOME - Banco XP S.A. (0348) Agência: 1 Conta: ..." → só o nome
  text = text.split(/\s+-\s+(?=Banco|BANCO|NU |Nu )/)[0]
  text = text.replace(/\s*\(\d{4}\).*$/, '')
  text = text.replace(PREFIXES, '')
  text = text.replace(/^\d{2}\.\d{3}\.\d{3}\s+/, '') // "60.904.858 Luiz Fernando"
  text = text.replace(/\s+\*.*$/, '') // "UBER * PENDING" → "UBER"
  text = text.replace(/\*.*$/, '') // "AIRBNB * ABC1234"
  text = text.replace(/\s+[A-Z0-9]{6,}$/i, (m) => (/\d/.test(m) ? '' : m)) // códigos alfanuméricos ao final
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) text = cleaned

  // Capitalização amigável quando vier tudo em maiúsculas
  if (text === text.toUpperCase() && text.length > 3) {
    text = text
      .toLowerCase()
      .split(' ')
      .map((w) => (/^(de|da|do|das|dos|e|em|a|o)$/.test(w) ? w : w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
  }
  return text
}
