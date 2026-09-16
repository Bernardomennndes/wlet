# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Controle financeiro PF + PJ: extratos e faturas viram lançamentos por um pipeline de ingestão, e tudo vive num Postgres atrás de `/v1`. Setup e visão geral em @README.md.

## Comandos

Todos rodam da raiz.

| Comando | O que faz |
|---|---|
| `pnpm dev` | sobe API e app juntos (turbo) |
| `pnpm check` | **é o comando de teste** — não existe `pnpm test` |
| `pnpm build` | `tsc -b && vite build` em `apps/web` |
| `pnpm type:check` | cobre `src/`, `scripts/` e `tests/` |
| `pnpm lint` | `biome lint .` na raiz (fora do turbo) |
| `pnpm format` | Biome, varrendo a árvore inteira a partir da raiz |

- **`pnpm run setup` — com o `run`.** `setup` é comando embutido do pnpm e ganha do script: `pnpm setup` responde "Everything is already up to date" e não gera nada.
- **Não há vitest nem jest.** O runner é o do próprio Node, via `tsx --test`. Um teste só: `pnpm --filter @wlet/web exec tsx --test scripts/checks/<arquivo>.test.ts`, com o caminho relativo ao pacote. Para filtrar por nome dentro da suíte, `--test-name-pattern`.
- O `check` de `apps/api` **exige banco real** — `DATABASE_URL`, `TEST_DATABASE_URL` e `AUTH_SECRET`, declaradas na task do `turbo.json`. O de `apps/web` não depende de nada.
- **`pnpm ingest` depois de mexer em `apps/web/scripts/` ou em `docs/`**, senão `src/generated/` fica velho.
- `pnpm lint` tem uma linha de base de **0 erros e 59 avisos** (medida em 16/09/2026). Erro derruba o portão; aviso não. A maior parte dos avisos é `noNonNullAssertion` e `useImportType`, e `pnpm lint --write` resolve cerca de 24 deles mecanicamente.
- Postgres de desenvolvimento na **porta 5433**, não 5432 (`docker compose up -d`).

## Estilo

- **O Biome formata e linta** — o oxlint foi removido em 16/09/2026. Formato: `lineWidth: 200`, aspas simples, **sem ponto e vírgula**, trailing comma em tudo, 2 espaços.
- **O linter roda o `preset: recommended` com duas faixas fora dele.** `a11y` está em `preset: none`: são 48 achados reais, quase todos `noLabelWithoutControl` em `routes/configuracao/-components`, e ligá-los de uma vez afogaria a linha de base — é débito, não ausência de problema. E o registry gerado (`packages/ui/src/components/**`, `apps/web/src/components/ui/**`) tem override desligando `useExhaustiveDependencies`, `noDangerouslySetInnerHtml` e `noArrayIndexKey`, porque não se conserta código que o `shadcn add` reescreve.
- **`erasableSyntaxOnly` está ligado na base do tsconfig**: `enum`, `namespace` e parameter property são proibidos no repositório inteiro. Não existe classe no projeto fora das classes de erro (que precisam de `instanceof`) — **adapter é factory com closure**.
- Identificadores em **inglês en-US**; prosa, comentários e texto de tela em **pt-BR com acentuação correta**.
- Depois de um `shadcn add`, rodar `pnpm format`: `src/components/ui/**` e `src/generated/**` também são formatados pelo Biome.

## Gotchas

- **Dinheiro é `numeric` no banco e chega como string.** A conversão acontece só na fronteira (`apps/api/src/shared/wire.ts`). Somar em float produz `12973.399999999999`; compare e divida em centavos.
- **`userId` entra pelo contexto, nunca por parâmetro** de rota.
- **`VITE_API_URL` é obrigatória** — o app recusa subir sem ela. É lida num lugar só, `apps/web/src/lib/api-url.ts`.
- **Não afrouxar o `envPrefix` do Vite.** É a única barreira entre `DATABASE_URL`/`AUTH_SECRET` e o bundle, porque as três moram no mesmo `.env` da raiz.
- **CORS com origem declarada (`WEB_ORIGIN`), nunca `*`.**
- **`drizzle-kit` executa `drizzle.config.ts` como CommonJS**: `import.meta.dirname` é `undefined` lá, e isso já derrubou `db:generate`.
- **Ao mudar a forma de um `apps/web/scripts/*.config.ts`, o `.example` ao lado acompanha na mesma alteração** — senão `pnpm run setup` num clone novo gera um arquivo que não compila.
- Muita coisa é local e não versionada: `.claude/`, `.env`, `.mcp.json`, `apps/web/docs/`, `apps/web/src/generated/` e todos os `apps/web/scripts/*.config.ts`. Um clone novo depende de `pnpm run setup`.

## Monorepo

pnpm + Turborepo sobre `apps/*`, `packages/*` e `config/*`. Só onde o nome engana:

- **`packages/api`** é o **contrato oRPC** — a única declaração da forma do fio, que gera REST de verdade e o OpenAPI em `/v1/openapi.json`. **`apps/api`** é o servidor Hono que o implementa.
- **`packages/services`** é a camada DDD hexagonal (contextos `dataset`, `config`, `plans`, `overrides`, `preferences`); **`packages/domain`** é vocabulário e regra pura, sem I/O.
- **`packages/ingest`** é o pipeline único de ingestão, o mesmo nos dois ambientes.
- **`packages/ui`** é o registry shadcn no estilo `base-mira`, sobre **Base UI e não Radix**.

Em `apps/web/src`, cada rota é uma pasta espelhando a URL: `index.tsx` (carregado por `React.lazy`), `-content.tsx` (a página) e `-components/`. Camada "view" é proibida.

## Rules

`.claude/rules/` guarda as regras de interface, contrato e dados que valem para arquivos específicos, e `.claude/rules/naming.md` é o índice: ele diz, pelo nome do arquivo, qual rule governa. Leia a rule antes de escrever o componente, não depois. Esse diretório não é versionado — num clone novo ele não existe.

## Git

`master` é o branch de trabalho: commits vão direto nele, sem branch nem PR. Conventional Commits com **escopo semântico em português**, não o nome do pacote — `test(regras):`, `fix(sensor):`, `test(conciliação):`. O assunto é uma frase declarativa que descreve o achado, não a ação.

## Débitos em aberto

Cada item foi conferido na data em que entrou e diz onde está o guarda que impede de piorar. Quem resolver um, tira daqui — e o teste correspondente acusa a anistia que sobreviveu ao problema.

- **A janela e a observação de um grupo de planos não chegam ao banco.** `PlanGroup` declara `from`, `to` e `note`, e a tela coleta os três, mas o contrato e a tabela só conhecem `{id, label}`: a pessoa vê "Grupo criado" e o que escreveu não existe mais. O conserto atravessa migração, contrato e handler. *Guarda:* `wire-shape.test.ts`, lista `DOES_NOT_CROSS` — falha se um quarto campo sumir, e também se estes voltarem a atravessar.
- **`packages/domain/src/plans.ts` documenta a era do navegador.** Diz que os planos ficam "guardados no navegador" e manda procurar `@/lib/storage`, módulo que não existe; `PLANS_KEY` segue exportado com zero consumidores. Quem abre o arquivo hoje conclui o contrário do que é verdade. *Guarda:* nenhum — comentário desatualizado não quebra teste.
- **Valores reais de compra em arquivos versionados.** As specs de `docs/superpowers/` trazem valores reais, e os mesmos números aparecem como fixture nos testes de `apps/api`. São valores apenas — sem CPF, conta, agência ou cartão, conferido por varredura. Se o repositório for público um dia, são gastos reais legíveis; se continuar privado, não são nada. *Guarda:* `personal-data.test.ts` cobre os caminhos declarados; para valor solto não há sensor, e provavelmente não deve haver — todo fixture de dinheiro pareceria violação.
- **Lançamento de OFX sem `<TRNAMT>` entra como R$ 0,00 em vez de ser descartado.** O `?? '0'` torna tag ausente indistinguível de valor zero e, com isso, passa por baixo da guarda de `NaN` da linha seguinte. O efeito é um lançamento de R$ 0,00 que entra na contagem, pede categoria, e ninguém sabe de onde veio. Não está consertado porque um OFX pode trazer `<TRNAMT>0</TRNAMT>` de propósito, e hoje os dois casos são o mesmo. *Guarda:* `parsers.test.ts` prende o comportamento atual com o porquê; trocar o `??` por um descarte deixa o teste vermelho e força a decisão de frente.
- **Duas escapatórias de relógio no ingest**, contra a promessa de que o mesmo `docs/` produz o mesmo resultado: `parsers.ts` tira o ano de `new Date().getFullYear()` quando a fatura do Nubank não traz data no nome, e `investments.ts` tira o `asOf` do relógio quando não há data no relatório de posição nem cache de CDI. Consertar as duas muda a assinatura de funções públicas. *Guarda:* `ingest-determinism.test.ts` nomeia as duas com o que custam e derruba uma terceira.
- **`settlement-history.tsx` remonta as badges de status** com `PayableStatusBadge` e `ReceivableStatusBadge` prontos ao lado — é a terceira cópia do mesmo `Map`. Contornável fazendo o `KINDS` carregar o componente em vez da lista de opções. *Guarda:* `enum-badge-reuse.test.ts`, allowlist com o motivo.
- **`packages/ui/src/components/sidebar.tsx` escreve o cookie sem guarda**, enquanto a leitura equivalente no `app-shell` tem `try`/`catch`. Veio do registry assim. *Guarda:* `browser-storage.test.ts`, allowlist com o motivo.
- **`apiOrigin` só é testável por fonte.** `import.meta.env` é por módulo, então o runner não alcança o de `api-url.ts` e o caminho com ambiente nunca roda. Bastaria a função aceitar a URL por parâmetro para as cinco URLs virarem teste de comportamento. *Guarda:* `api-url.test.ts` extrai a expressão do arquivo e a aplica — cobertura declarada como parcial.
- **A a11y está desligada no linter.** `a11y` está em `preset: none` no `biome.json`, escondendo 48 achados medidos em 16/09/2026 — 30 deles `noLabelWithoutControl`, e 27 em `routes/configuracao/-components`. Foi desligada para a troca de oxlint por Biome não afogar a linha de base, não porque os problemas não existam. *Guarda:* nenhum — regra desligada não acende.
- **`noArrayIndexKey` está rebaixada a aviso** por causa de três arquivos próprios — `goals-card.tsx`, `planos-data-table.tsx` e `purchase-meter.tsx` — que usam o índice como key; nos gerados do registry ela está off. Índice como key é o defeito que só aparece quando a lista reordena. *Guarda:* nenhum além do próprio aviso na linha de base do `pnpm lint`.
