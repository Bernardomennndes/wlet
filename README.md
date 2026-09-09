# WLET

Controle financeiro pessoal (PF) e da empresa (PJ) a partir de extratos e faturas exportados dos bancos. Sem banco de dados: um script lê os arquivos em `docs/`, identifica as contas, categoriza e pareia transferências, e grava JSON em `src/generated/`. A SPA (Vite, React 19, Tailwind v4, React Router, Recharts) lê esses JSON.

```sh
pnpm install
pnpm run setup  # cria os *.config.ts locais e gera um dataset fictício
pnpm dev
```

`pnpm run setup` deixa o app rodando com dados inventados, para você ver a tela antes de entregar
qualquer extrato. Para usar os seus, veja **Como adicionar movimentações**.

Outros scripts: `pnpm ingest`, `pnpm cdi` (baixa o CDI do Banco Central, para valorar a renda fixa), `pnpm build`, `pnpm preview`, `pnpm lint`, `pnpm check` (testes do calendário bancário e da conciliação, no runner do próprio Node).

## Privacidade

**Nenhum dado seu entra no repositório.** O `.gitignore` mantém de fora:

| Caminho | O que tem dentro |
|---|---|
| `docs/` | os extratos e faturas crus |
| `src/generated/*.json` | toda transação: estabelecimento, valor, data, descrição, conta |
| `scripts/accounts.config.ts` | seu nome e os números das suas contas |
| `scripts/rules.config.ts` | o comércio do seu bairro, os seus clientes, a sua cidade |
| `scripts/planned.config.ts` | salário e recebíveis previstos |
| `scripts/receivables.config.ts` | quem te deve dinheiro |
| `scripts/goals.config.ts`, `scripts/budget.config.ts` | metas, teto de gastos e rubricas |
| `scripts/trips.config.ts` | as viagens que você fez, com destino e datas |

Cada `*.config.ts` tem um `*.config.example.ts` versionado, com a mesma forma e dados
fictícios — é dele que o `pnpm run setup` parte. O `src/generated/` de um clone novo é escrito
por `scripts/seed.ts`, que inventa oito meses de movimento: o que viaja no repositório é o
gerador, não a massa de dados.

## Como adicionar movimentações

1. Ajuste `scripts/accounts.config.ts` com as suas contas (o modelo já traz Inter, Nubank e XP).
2. Exporte o extrato ou a fatura no banco (OFX de preferência; CSV para fatura XP).
3. Solte o arquivo na pasta correspondente em `docs/extrato/<banco>/` ou `docs/fatura/<banco>/`.
4. Rode `pnpm ingest`. O relatório no terminal mostra arquivos lidos, duplicados ignorados, transferências sem contraparte e lançamentos sem categoria específica.

Regras de leitura:

- O mesmo documento em vários formatos usa só o mais rico: OFX, depois CSV, depois PDF. TXT é ignorado. PDF só é lido para fatura do Nubank, porque o banco não publica outro formato antes de 2024 — e só entra se a soma dos lançamentos fechar com o total impresso na própria fatura.
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
- **Lançamento previsto**: valor, categoria, recorrência e o dia em que cai — dia fixo (`{ kind: 'day', day: 25 }`) ou dia útil (`{ kind: 'business-day', nth: 5 }`, pelo calendário bancário). O dia é o que permite ao mês em curso mostrar o que ainda vence nele, em vez de esperar o mês virar.
- **Transferência**: pareada quando há saída numa conta e entrada de valor idêntico em outra até 4 dias depois, com descrição apontando para o próprio titular ou para pagamento de fatura. Pagamento de fatura e Pix no Crédito sem o outro lado no período ganham a contraparte inferida (conta e cartão do mesmo banco). Aportes na conta investimento viram transferência para a conta virtual, e os resgates que voltam como TED nominal do titular são reconhecidos pelo extrato da corretora. O que sobra fica marcado como `unmatched-self` e não entra como receita nem despesa.
- **Patrimônio**: a carteira reconstruída mês a mês de três fontes — a posição da B3 (o que você tem), a movimentação da B3 (quando cada papel entrou, para valorar o passado pelo CDI) e o extrato da corretora (o aporte líquido e o caixa). O rendimento é o patrimônio menos o aporte, e só vale porque a soma do razão da corretora confere com o saldo que ela declara.
- **Conta a pagar**: uma regra de `planned.config.ts` que declara `match` — credor conhecido e vencimento. Ganha situação de pagamento (paga, parcial, em aberto, em atraso). Sem `match` a regra só projeta, que é o certo para gasto sem credor único.
- **Rubrica**: gasto esperado por categoria, em `budget.config.ts`. Teto no mês em curso, previsão nos meses futuros — e na projeção é piso, não soma: o que já está contratado em parcelas abate a rubrica em vez de se acumular a ela.
- **Cobrança**: o que alguém te deve, com vencimento e vigência. Conciliada pelo ingest por contraparte e conta — nunca por valor, porque um rateio varia mês a mês. Uma cobrança parcelada é uma dívida só: o dinheiro abate a próxima parcela em aberto, então pagar adiantado não deixa o mês seguinte em atraso. O recebimento não é receita: é **reembolso**, o quarto fluxo, e abate a categoria de despesa que a cobrança declara. Pagar o aluguel inteiro e receber metade de volta deixa a moradia do mês pelo custo real, não pelo valor cheio.
- **Recorte PF / PJ / Consolidado**: uma transferência só é neutra se as duas pontas estão no recorte. Na visão Empresa, o Pix do Inter para a XP vira "Retirada para o sócio"; na visão Pessoa física, "Retirada da PJ".

## Categorias

Regras por palavra-chave, em três camadas — a primeira que casa vence. `PRIORITY_RULES` (movimentação interna e plataforma intermediária, como o `IFD*` do iFood) ganha de tudo; depois as suas regras, em `scripts/rules.config.ts`, que não é versionado; por último as genéricas de `BASE_RULES`. A ordem é o que permite `MERCADO DO SEU JOÃO` ganhar do genérico `MERCADO `. Ajustes manuais feitos na tabela de transações ficam no `localStorage` do navegador e podem ser exportados em JSON pelo botão da página. Para tornar um ajuste permanente, transforme-o em regra e rode `pnpm ingest` de novo.

## Estrutura

```
docs/                    extratos e faturas (entrada)
scripts/ingest.ts        pipeline docs/ → src/generated/
scripts/parsers.ts       OFX (extrato e fatura) e CSV da fatura XP
scripts/setup.ts         prepara um clone novo (configs + dataset fictício)
scripts/matching.ts      casa regra declarada com o extrato (usado pelo ingest E pelo seed)
scripts/checks/          testes de `pnpm check`
scripts/xlsx.ts          leitor mínimo de xlsx (B3 e extrato da corretora), sem dependência
scripts/pdf.ts           extrator de texto de PDF (faturas Nubank anteriores a 2024), sem dependência
scripts/trips.config.ts     as viagens realizadas; o ingest calcula o custo de cada uma
src/lib/plans.ts         planos de compra: catálogo no navegador, com envelope versionado
src/routes/planos/       a tela de planos: grupos, situação e parcelamento
scripts/brokerage.ts     o razão de caixa da corretora: aporte líquido, resgate, taxa e saldo
scripts/cdi.ts           o cache do CDI (leitura pura, sem rede)
scripts/fetch-cdi.ts     baixa o CDI diário do Banco Central para docs/investimentos/
scripts/investments.ts   reconstrói a carteira mês a mês: posição + movimentação + CDI
scripts/seed.ts          gera o dataset fictício de src/generated/
scripts/rules.ts         categorização genérica e limpeza de descrição
scripts/*.config.ts      dado pessoal, NÃO versionado (o `.example` de cada um é)
scripts/accounts.config.ts  contas conhecidas
scripts/planned.config.ts   lançamentos previstos (a previsão dos gráficos), com o dia de cada um
scripts/receivables.config.ts  cobranças: quem te deve, e a despesa que o recebimento abate
scripts/goals.config.ts     metas de poupança (o cartão "Metas" da visão geral)
scripts/budget.config.ts    teto do mês e rubricas de gasto por categoria
src/lib/settlement.ts    conciliação: uma só para cobrança e conta a pagar
src/generated/*.json     saída gerada, NÃO versionada
src/data/                vocabulário de domínio (tipos, listas de enum, catálogo de categorias)
src/lib/finance.ts       recortes, agregações mensais, por categoria, recorrências
src/lib/receivables.ts   cobranças: vencimento, conciliação e situação por mês
src/lib/storage.ts       o que o app guarda no navegador: o prefixo das chaves num lugar só
src/components/ui/       componentes shadcn (estilo base-mira, Base UI) + AppCombobox, MonthPicker, MoneyInput e BarProgress compostos sobre eles
src/components/enum-badge.tsx  o badge de enum, e a tradução de `tone` em cor num lugar só
src/components/*-badge.tsx  badges de domínio (entidade, categoria, tipo de conta, tipo de transferência, fluxo, status)
src/components/breadcrumbs.tsx  trilha de navegação, derivada da URL
src/components/not-informed.tsx  o texto de ausência de dado, num lugar só
src/components/layout/nav.ts  fonte única da navegação: barra lateral e trilha
src/components/kpi/      shells de KPI com explicação obrigatória do cálculo
src/components/data-list/ lista de leitura por item (ul/li + dt/dd)
src/lib/business-days.ts calendário bancário: o 5º dia útil de um lançamento previsto
src/components/charts/  o que mais de uma tela desenha: tokens, divisor de projeção, barra de volume
src/routes/patrimonio/    a tela de investimentos: herói + benchmark CDI, proventos, alocação
src/routes/<url>/        uma pasta por rota: index.tsx + -content.tsx + -components/
src/routes/-components/  gráfico de UMA tela mora na rota dela (MonthlyFlowChart na visão geral;
                         BarList e CategoryStackChart em src/routes/categorias/-components/)
src/providers/           contexto de filtros (recorte, período, tema) + _index.tsx, o composition root
src/hooks/               hooks compartilhados entre telas (título do documento)
```

Ícones são do `@phosphor-icons/react`, declarado em `components.json` (`iconLibrary`), então o `shadcn add` já emite os imports certos. Componentes de interface vêm do registry do shadcn (`pnpm dlx shadcn add <nome>`); só gráficos são próprios, sobre Recharts — e um gráfico usado por uma tela só vive no `-components/` daquela rota, não numa pasta compartilhada.

Parâmetros de URL para abrir num estado específico: `?recorte=PJ&de=2026-01&ate=2026-06&tema=claro`. Cada limite de período vale sozinho (`?de=2026-05` basta). O início é limitado ao primeiro mês com lançamentos; o fim é livre, porque parcela e plano podem cair em qualquer mês à frente. Um período que termina antes do primeiro lançamento cai no padrão em vez de abrir a tela vazia. Filtros de tela (`?mes`, `?categoria`, `?conta`, `?fluxo`, `?q`) convivem com os do cabeçalho: mexer num não apaga o outro.

## Licença

[MIT](LICENSE). O software é fornecido "como está", sem garantia — vale reler essa cláusula
antes de agir sobre um número que ele calculou.

A fonte é a exceção: `@fontsource-variable/inter` é **OFL-1.1**, não MIT, e os arquivos `.woff2`
que vão no `dist/` carregam a obrigação de manter o aviso da própria fonte. É um regime à parte,
que convive com a licença do código.
