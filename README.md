# Wallet

Controle financeiro pessoal (PF) e da empresa (PJ) a partir de extratos e faturas exportados dos bancos. Sem banco de dados: um script lê os arquivos em `docs/`, identifica as contas, categoriza e pareia transferências, e grava JSON em `src/generated/`. A SPA (Vite, React 19, Tailwind v4, React Router, Recharts) lê esses JSON.

```sh
pnpm install
pnpm setup    # cria os *.config.ts locais e gera um dataset fictício
pnpm dev
```

`pnpm setup` deixa o app rodando com dados inventados, para você ver a tela antes de entregar
qualquer extrato. Para usar os seus, veja **Como adicionar movimentações**.

Outros scripts: `pnpm ingest`, `pnpm build`, `pnpm preview`, `pnpm lint`.

## Privacidade

**Nenhum dado seu entra no repositório.** O `.gitignore` mantém de fora:

| Caminho | O que tem dentro |
|---|---|
| `docs/` | os extratos e faturas crus |
| `src/generated/*.json` | toda transação: estabelecimento, valor, data, descrição, conta |
| `scripts/accounts.config.ts` | seu nome e os números das suas contas |
| `scripts/rules.config.ts` | o comércio do seu bairro, os seus clientes, a sua cidade |
| `scripts/planned.config.ts` | salário e recebíveis previstos |
| `scripts/goals.config.ts`, `scripts/budget.config.ts` | metas e teto de gastos |

Cada `*.config.ts` tem um `*.config.example.ts` versionado, com a mesma forma e dados
fictícios — é dele que o `pnpm setup` parte. O `src/generated/` de um clone novo é escrito
por `scripts/seed.ts`, que inventa oito meses de movimento: o que viaja no repositório é o
gerador, não a massa de dados.

## Como adicionar movimentações

1. Ajuste `scripts/accounts.config.ts` com as suas contas (o modelo já traz Inter, Nubank e XP).
2. Exporte o extrato ou a fatura no banco (OFX de preferência; CSV para fatura XP).
3. Solte o arquivo na pasta correspondente em `docs/extrato/<banco>/` ou `docs/fatura/<banco>/`.
4. Rode `pnpm ingest`. O relatório no terminal mostra arquivos lidos, duplicados ignorados, transferências sem contraparte e lançamentos sem categoria específica.

Regras de leitura:

- O mesmo documento em vários formatos (OFX, CSV, PDF, TXT) usa só o mais rico: OFX, depois CSV. PDF e TXT são ignorados.
- Downloads repetidos (`arquivo (1).ofx`) ou dois arquivos cobrindo o mesmo período da mesma conta: fica o que tiver mais transações.
- A conta é identificada pelos metadados do próprio arquivo (código do banco, número da conta, extrato × fatura). Contas conhecidas estão em `scripts/accounts.config.ts`; uma conta nova é criada automaticamente com nome genérico e um aviso no terminal.

## Contas

| Conta | Entidade | Tipo | Fonte |
|---|---|---|---|
| Inter PJ | PJ | conta corrente | `docs/extrato/inter` |
| Nubank Conta | PF | conta corrente | `docs/extrato/nubank` |
| Nubank Cartão | PF | cartão | `docs/fatura/nubank` |
| XP Conta | PF | conta corrente | `docs/extrato/xp` |
| XP Cartão | PF | cartão | `docs/fatura/xp` |
| XP Investimentos | PF | virtual | só como contraparte dos aportes |

## Modelo

- **Transação** (`src/data/types.ts`): valor com sinal, data de competência, descrição limpa, contraparte normalizada, categoria, parcela, fatura de origem e, se for transferência, o par e a conta do outro lado.
- **Data de competência**: compras no cartão contam pela data da compra; parcelas são deslocadas mês a mês (parcela 4 de 6 comprada em setembro cai em dezembro).
- **Transferência**: pareada quando há saída numa conta e entrada de valor idêntico em outra até 4 dias depois, com descrição apontando para o próprio titular ou para pagamento de fatura. Pagamento de fatura e Pix no Crédito sem o outro lado no período ganham a contraparte inferida (conta e cartão do mesmo banco). Aportes na conta investimento viram transferência para a conta virtual. O que sobra fica marcado como `unmatched-self` e não entra como receita nem despesa.
- **Recorte PF / PJ / Consolidado**: uma transferência só é neutra se as duas pontas estão no recorte. Na visão Empresa, o Pix do Inter para a XP vira "Retirada para o sócio"; na visão Pessoa física, "Retirada da PJ".

## Categorias

Regras por palavra-chave, em três camadas — a primeira que casa vence. `PRIORITY_RULES` (movimentação interna e plataforma intermediária, como o `IFD*` do iFood) ganha de tudo; depois as suas regras, em `scripts/rules.config.ts`, que não é versionado; por último as genéricas de `BASE_RULES`. A ordem é o que permite `MERCADO DO SEU JOÃO` ganhar do genérico `MERCADO `. Ajustes manuais feitos na tabela de transações ficam no `localStorage` do navegador e podem ser exportados em JSON pelo botão da página. Para tornar um ajuste permanente, transforme-o em regra e rode `pnpm ingest` de novo.

## Estrutura

```
docs/                    extratos e faturas (entrada)
scripts/ingest.ts        pipeline docs/ → src/generated/
scripts/parsers.ts       OFX (extrato e fatura) e CSV da fatura XP
scripts/setup.ts         prepara um clone novo (configs + dataset fictício)
scripts/seed.ts          gera o dataset fictício de src/generated/
scripts/rules.ts         categorização genérica e limpeza de descrição
scripts/*.config.ts      dado pessoal, NÃO versionado (o `.example` de cada um é)
scripts/accounts.config.ts  contas conhecidas
scripts/planned.config.ts   lançamentos previstos (a previsão dos gráficos)
scripts/goals.config.ts     metas de poupança (o cartão "Metas" da visão geral)
scripts/budget.config.ts    teto de gastos do mês (o cartão "Controle de orçamento")
src/generated/*.json     saída gerada, NÃO versionada
src/data/                vocabulário de domínio (tipos, listas de enum, catálogo de categorias)
src/lib/finance.ts       recortes, agregações mensais, por categoria, recorrências
src/components/ui/       componentes shadcn (estilo base-mira, Base UI) + AppSelect, AppCombobox, MonthPicker e BarProgress compostos sobre eles
src/components/enum-badge.tsx  o badge de enum, e a tradução de `tone` em cor num lugar só
src/components/*-badge.tsx  badges de domínio (entidade, categoria, tipo de conta, tipo de transferência, fluxo, status)
src/components/breadcrumbs.tsx  trilha de navegação, derivada da URL
src/components/not-informed.tsx  o texto de ausência de dado, num lugar só
src/components/layout/nav.ts  fonte única da navegação: barra lateral e trilha
src/components/kpi/      shells de KPI com explicação obrigatória do cálculo
src/components/data-list/ lista de leitura por item (ul/li + dt/dd)
src/components/charts/chart-theme.ts  tokens de gráfico compartilhados por todas as telas
src/routes/<url>/        uma pasta por rota: index.tsx + -content.tsx + -components/
src/routes/-components/  gráfico de UMA tela mora na rota dela (MonthlyFlowChart na visão geral;
                         BarList e CategoryStackChart em src/routes/categorias/-components/)
src/providers/           contexto de filtros (recorte, período, tema) + _index.tsx, o composition root
src/hooks/               hooks compartilhados entre telas (título do documento)
```

Componentes de interface vêm do registry do shadcn (`pnpm dlx shadcn add <nome>`); só gráficos são próprios, sobre Recharts — e um gráfico usado por uma tela só vive no `-components/` daquela rota, não numa pasta compartilhada.

Parâmetros de URL para abrir num estado específico: `?recorte=PJ&de=2026-01&ate=2026-06&tema=claro`. Cada limite de período vale sozinho (`?de=2026-05` basta), e um período que não encosta nos dados nem no horizonte de projeção cai no padrão em vez de abrir a tela vazia. Filtros de tela (`?mes`, `?categoria`, `?conta`, `?fluxo`, `?q`) convivem com os do cabeçalho: mexer num não apaga o outro.
