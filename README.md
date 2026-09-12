# WLET

Controle financeiro pessoal (PF) e da empresa (PJ) a partir de extratos e faturas exportados dos bancos. Um pipeline lê os arquivos, identifica as contas, categoriza e pareia transferências, e o resultado alimenta a SPA (Vite, React 19, Tailwind v4, React Router, Recharts).

**O app fala com um servidor que é seu.** `apps/api` guarda tudo num Postgres que você
hospeda, e `VITE_API_URL` diz onde ele está — a variável é obrigatória, e sem ela o app recusa
a subir dizendo o que falta. Houve um modo que guardava tudo no navegador; ele saiu porque cada
dado tinha duas respostas possíveis conforme onde fosse lido, e a mesma conta aberta em dois
aparelhos mostrava números diferentes sem nada avisar.

O pipeline é **um só e roda nos dois lugares**: no terminal (`pnpm ingest`) e no servidor. Duas
implementações do mesmo casamento divergiriam no primeiro ajuste — e a prova de que é uma só é
executável: o servidor produz as mesmas 5.694 transações, com os mesmos ids, que o terminal.

```sh
pnpm install
pnpm run setup  # cria os *.config.ts locais e gera um dataset fictício
cp .env.example .env && docker compose up -d   # Postgres; preencha AUTH_SECRET com `openssl rand -base64 32`
pnpm --filter @wlet/db migrate
pnpm dev        # sobe a API e o app juntos
```

`pnpm run setup` deixa o app rodando com dados inventados, para você ver a tela antes de entregar
qualquer extrato. Para usar os seus, veja **Como adicionar movimentações**.

Outros scripts: `pnpm ingest`, `pnpm package` (gera um arquivo com TUDO — conjunto, declarações e os extratos originais — para importar noutra instalação), `pnpm cdi` (baixa o CDI do Banco Central, para valorar a renda fixa), `pnpm build`, `pnpm preview`, `pnpm lint`, `pnpm check` (testes do calendário bancário e da conciliação, no runner do próprio Node).

## Privacidade

**Nenhum dado seu entra no repositório.** O `.gitignore` mantém de fora:

| Caminho | O que tem dentro |
|---|---|
| `apps/web/docs/` | os extratos e faturas crus |
| `apps/web/src/generated/*.json` | toda transação: estabelecimento, valor, data, descrição, conta |
| `apps/web/scripts/accounts.config.ts` | seu nome e os números das suas contas |
| `apps/web/scripts/rules.config.ts` | o comércio do seu bairro, os seus clientes, a sua cidade |
| `apps/web/scripts/planned.config.ts` | salário e recebíveis previstos |
| `apps/web/scripts/receivables.config.ts` | quem te deve dinheiro |
| `apps/web/scripts/goals.config.ts`, `budget.config.ts` | metas, teto de gastos e rubricas |

> **A promessa é "o servidor é seu", e não "nada sai da máquina".** Os extratos, as transações e
> as declarações vivem num Postgres que VOCÊ hospeda, e a conta é protegida por uma sessão em
> cookie `httpOnly`. O `.gitignore` continua valendo para o repositório; o que ele não cobre é
> onde o dado descansa — isso é escolha de quem instala.

Cada `*.config.ts` tem um `*.config.example.ts` versionado, com a mesma forma e dados
fictícios — é dele que o `pnpm run setup` parte. O `apps/web/src/generated/` de um clone novo é escrito
por `apps/web/scripts/seed.ts`, que inventa oito meses de movimento: o que viaja no repositório é o
gerador, não a massa de dados.

## Como adicionar movimentações

1. Ajuste `apps/web/scripts/accounts.config.ts` com as suas contas (o modelo já traz Inter, Nubank e XP).
2. Exporte o extrato ou a fatura no banco (OFX de preferência; CSV para fatura XP).
3. Solte o arquivo na pasta correspondente em `apps/web/docs/extrato/<banco>/` ou `apps/web/docs/fatura/<banco>/`.
4. Rode `pnpm ingest`. O relatório no terminal mostra arquivos lidos, duplicados ignorados, transferências sem contraparte e lançamentos sem categoria específica.

**Ou sem terminal nenhum:** abra **Meus dados** e escolha a pasta `apps/web/docs/`. Os arquivos sobem para o servidor, o mesmo pipeline roda lá, e o mesmo relatório aparece na tela. É preciso escolher a PASTA, e não arquivos soltos: só assim o navegador entrega o caminho de cada arquivo, e sem caminho o pipeline não distingue a fatura do extrato do mesmo banco.

> Os arquivos ficam guardados no servidor depois da primeira leitura, e é por isso que **Reprocessar** existe: mudou um perfil de conta ou uma regra de categoria, ele aplica a mudança sem escolher a pasta de novo. Enquanto o dado morava só em arquivo, perdê-lo era irrelevante — bastava rodar o ingest de novo; agora o Postgres é a cópia que importa, então faça backup dele, e use **Exportar** para ter também um JSON que se lê em qualquer lugar.

Regras de leitura:

- O mesmo documento em vários formatos usa só o mais rico: OFX, depois CSV, depois PDF. TXT é ignorado. PDF só é lido para fatura do Nubank, porque o banco não publica outro formato antes de 2024 — e só entra se a soma dos lançamentos fechar com o total impresso na própria fatura.
- Downloads repetidos (`arquivo (1).ofx`) ou dois arquivos cobrindo o mesmo período da mesma conta: fica o que tiver mais transações.
- A conta é identificada pelos metadados do próprio arquivo (código do banco, número da conta, extrato × fatura). Contas conhecidas estão em `apps/web/scripts/accounts.config.ts`; uma conta nova é criada automaticamente com nome genérico e um aviso no terminal.

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

- **Transação** (`packages/domain`): valor com sinal, data de competência, descrição limpa, contraparte normalizada, categoria, parcela, fatura de origem e, se for transferência, o par e a conta do outro lado.
- **Data de competência**: compras no cartão contam pela data da compra; parcelas são deslocadas mês a mês (parcela 4 de 6 comprada em setembro cai em dezembro).
- **Lançamento previsto**: valor, categoria, recorrência e o dia em que cai — dia fixo (`{ kind: 'day', day: 25 }`) ou dia útil (`{ kind: 'business-day', nth: 5 }`, pelo calendário bancário). O dia é o que permite ao mês em curso mostrar o que ainda vence nele, em vez de esperar o mês virar.
- **Transferência**: pareada quando há saída numa conta e entrada de valor idêntico em outra até 4 dias depois, com descrição apontando para o próprio titular ou para pagamento de fatura. Pagamento de fatura e Pix no Crédito sem o outro lado no período ganham a contraparte inferida (conta e cartão do mesmo banco). Aportes na conta investimento viram transferência para a conta virtual, e os resgates que voltam como TED nominal do titular são reconhecidos pelo extrato da corretora. O que sobra fica marcado como `unmatched-self` e não entra como receita nem despesa.
- **Patrimônio**: a carteira reconstruída mês a mês de três fontes — a posição da B3 (o que você tem), a movimentação da B3 (quando cada papel entrou, para valorar o passado pelo CDI) e o extrato da corretora (o aporte líquido e o caixa). O rendimento é o patrimônio menos o aporte, e só vale porque a soma do razão da corretora confere com o saldo que ela declara.
- **Conta a pagar**: uma regra de `planned.config.ts` que declara `match` — credor conhecido e vencimento. Ganha situação de pagamento (paga, parcial, em aberto, em atraso). Sem `match` a regra só projeta, que é o certo para gasto sem credor único.
- **Rubrica**: gasto esperado por categoria, em `budget.config.ts` (editável em **Rubricas**). Teto no mês em curso, previsão nos meses futuros — e na projeção é piso, não soma: o que já está contratado em parcelas abate a rubrica em vez de se acumular a ela. Ela pode ser um número digitado ou uma **composição** de itens — quantidade, unidade, cadência e preço unitário —, e nesse caso o valor é a soma deles. "2 kg de frango por semana a R$ 22" vira R$ 191,19/mês, pela média do ano civil. Serve ao gasto que você conhece item a item, e o que se ganha é a memória do cálculo: o total continua dizendo de onde saiu, e quando um item muda de preço dá para saber quanto mexer. A tela de **Rubricas** alterna entre semana e mês; o planejado é dividido, nunca remedido.
- **Cobrança**: o que alguém te deve, com vencimento e vigência. Conciliada pelo ingest por contraparte e conta — nunca por valor, porque um rateio varia mês a mês. Uma cobrança parcelada é uma dívida só: o dinheiro abate a próxima parcela em aberto, então pagar adiantado não deixa o mês seguinte em atraso. O recebimento não é receita: é **reembolso**, o quarto fluxo, e abate a categoria de despesa que a cobrança declara. Pagar o aluguel inteiro e receber metade de volta deixa a moradia do mês pelo custo real, não pelo valor cheio.
- **Recorte PF / PJ / Consolidado**: uma transferência só é neutra se as duas pontas estão no recorte. Na visão Empresa, o Pix do Inter para a XP vira "Retirada para o sócio"; na visão Pessoa física, "Retirada da PJ".

## Categorias

Regras por palavra-chave, em três camadas — a primeira que casa vence. `PRIORITY_RULES` (movimentação interna e plataforma intermediária, como o `IFD*` do iFood) ganha de tudo; depois as suas regras, em `apps/web/scripts/rules.config.ts`, que não é versionado; por último as genéricas de `BASE_RULES`. A ordem é o que permite `MERCADO DO SEU JOÃO` ganhar do genérico `MERCADO `. Ajustes manuais feitos na tabela de transações ficam no servidor, chaveados pelo id do lançamento, e viajam no pacote de exportação. Para tornar um ajuste permanente, transforme-o em regra e reprocesse — assim ele passa a valer para todo lançamento parecido, e não só para aquele.

## Estrutura

Monorepo pnpm orquestrado por Turborepo, no molde do projeto Selfie.

```
apps/web/                a SPA — telas, providers, hooks e o portão de boot
apps/web/scripts/        as cascas de Node: ingest, seed, setup, cdi, package
apps/web/scripts/checks/ os testes do app (runner embutido do Node, via tsx)
apps/web/docs/           extratos e faturas crus (entrada, NÃO versionado)
apps/web/src/generated/  a saída do ingest local (NÃO versionada)

apps/api/                o servidor: Hono + @orpc/server, com o pipeline dentro
apps/api/src/routers/    um router por contexto, ligando o contrato aos dados
apps/api/tests/          a suíte do servidor, contra um Postgres de verdade

packages/domain/         o vocabulário: tipos, listas de enum, catálogo de categorias
                         e as regras PURAS (plans, rubric) — a base da pilha
packages/ingest/         O PIPELINE, um só para os três ambientes: parsers OFX/CSV,
                         xlsx e pdf sem dependência, categorização, casamento,
                         corretora, investimentos, e o `IngestEnv` de cada lado
packages/services/       a camada DDD: cinco contextos (dataset, config, plans,
                         overrides, preferences), cada um com domain/ports,
                         application e infrastructure — com adapters de NAVEGADOR
                         e de SERVIDOR lado a lado
packages/api/            o CONTRATO oRPC, declarado uma vez e consumido pelos dois
                         lados: domains/<x>/{routes,shape}.ts, contracts/, clients/
packages/db/             Drizzle: schema por entidade, migrations versionadas
packages/ui/             os componentes shadcn (base-mira, Base UI) e as composições
                         próprias — AppCombobox, MonthPicker, MoneyInput, QuantityInput
packages/lib/            o que app e interface dividem: format, cn, portable
packages/env/            o `.env` da RAIZ, achado subindo até o pnpm-workspace.yaml,
                         para o `cwd` de cada pacote não decidir o que ele enxerga
config/tsconfig/         as bases que todo pacote estende
```

Dentro de `apps/web/src`, cada rota é uma pasta espelhando a URL, com `index.tsx`, `-content.tsx`
e um `-components/` para o que pertence só a ela. Gráfico usado por uma tela mora na rota dela;
só o compartilhado fica em `src/components/charts/`.

### Comandos

Todos a partir da raiz:

| | |
|---|---|
| `pnpm dev` | sobe o app e a API |
| `pnpm build` · `pnpm check` · `pnpm lint` · `pnpm format` | os portões |
| `pnpm type:check` | typecheck de todos os pacotes, isoladamente |
| `pnpm ingest` · `pnpm cdi` · `pnpm package` · `pnpm setup` | as cascas de Node do app |
| `docker compose up -d` | o Postgres de desenvolvimento (porta **5433**) |
| `pnpm --filter @wlet/db db:migrate` | aplica as migrations |
| `pnpm --filter @wlet/api-server dev` | sobe o servidor |

`pnpm check` roda as duas suítes: a do app não depende de nada, a do servidor precisa de
`DATABASE_URL`.

### O `.env`

É **um arquivo só, na raiz** — copie o `.env.example` para `.env` e preencha. Todo pacote o lê de
lá, esteja o comando sendo disparado de onde estiver: a busca sobe até o `pnpm-workspace.yaml` em
vez de olhar o diretório corrente. Precedência: o **ambiente real** ganha do `.env.local`, que
ganha do `.env`.

Só as variáveis com prefixo `VITE_` chegam ao navegador — é essa regra que mantém a
`DATABASE_URL` e o `AUTH_SECRET` fora do bundle, mesmo morando no mesmo arquivo que a
`VITE_API_URL`.

**`VITE_API_URL` é obrigatória.** Ela aponta para a origem mais o canal (`http://host/v1`); o
Better Auth mora na raiz da mesma origem, e o app tira o `/v1` sozinho — uma variável por
servidor, para as duas não divergirem no primeiro deploy. Sem ela o app não sobe, e diz por quê:
não existe mais um modo sem servidor para onde cair, e um endereço adivinhado só adiaria o erro
até a primeira requisição, onde ele chega como 404 sem explicação.

## Licença

[MIT](LICENSE). O software é fornecido "como está", sem garantia — vale reler essa cláusula
antes de agir sobre um número que ele calculou.

A fonte é a exceção: `@fontsource-variable/inter` é **OFL-1.1**, não MIT, e os arquivos `.woff2`
que vão no `dist/` carregam a obrigação de manter o aviso da própria fonte. É um regime à parte,
que convive com a licença do código.
