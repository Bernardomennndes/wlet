# Plano vinculado a uma compra parcelada

Data: 2026-09-14 · Estado: aprovado em brainstorming, seções 1 a 4

## Problema

Um plano de compra (`Plan`) pode descrever algo que **já foi comprado** e está parcelado no cartão. O
caso real: o plano "Airbnb Arraial D'ajuda" (decidido, parcelado 6×, total R$ 5.622,20, mês 2026-08)
é a mesma compra que aparece na fatura do XP Cartão como `AIRBNB PAGAM*AIRB`, 6× de ~R$ 937,03, com
data de compra 2026-07-04 e duas parcelas já nos arquivos (1/6 na fatura 2026-08, 2/6 na 2026-09).

Hoje nada liga os dois, e isso produz dois defeitos:

1. **Contagem dupla na previsão.** O plano decidido soma `installmentAmount` em `sources.plan`
   (`apps/web/src/lib/forecast.ts`, laço de planos em `expenseByCategory` e em `forecastItems`), e as
   parcelas restantes da compra somam em `sources.committed` (`committedByCategory`). Nada deduplica:
   o mesmo mês pesa ~R$ 937 duas vezes.
2. **A tela não diz o que já foi pago.** A pessoa quer ver que o plano já foi decidido E que parte dele
   já saiu do bolso.

## Decisões tomadas

| Pergunta | Decisão |
| --- | --- |
| Depois de ligado, quem manda nos meses que faltam? | **A compra.** O plano vira fato: deixa de projetar valor próprio; pago, a cair e total saem das parcelas reais. Preço e mês planejados ficam como referência. |
| Como o vínculo nasce? | **A pessoa escolhe, com sugestão.** Nada é ligado sem confirmação; não há casamento automático no ingest. |
| Onde aparece o "pago" em verde? | **Na linha do plano**, num medidor por parcela. O gráfico só olha meses futuros e não ganha fatia verde. |
| O que o plano guarda para achar a compra? | **Abordagem A:** o id de UMA parcela da compra (`purchaseId`). |

## Fatos medidos que o desenho usa

- `Transaction.date` é a competência; `postedDate` é a **data da compra**, igual em todas as parcelas
  da mesma compra (`packages/ingest/src/pipeline.ts`: `date = addMonths(postedDate, current - 1)`).
  Conferido na semente: as duas parcelas do Airbnb de julho têm `postedDate` 2026-07-04.
- A descrição crua (`rawDescription`) repete entre parcelas, **mas também entre compras diferentes**: a
  hospedagem de maio/26 (6× de R$ 1.151,41, estornada) tem a mesma `AIRBNB PAGAM*AIRB` com
  `postedDate` 2026-05-11. É a data da compra que separa as duas.
- O valor varia centavos entre parcelas (937,05 e 937,03): não serve de chave.
- O id de um lançamento é `sha1` de perfil da conta, `postedDate`, valor, descrição, `fitId`, mês da
  fatura e ordinal — cada parcela tem id próprio, e **não existe id da compra**. O id é estável entre
  reprocessamentos; muda se o perfil da conta mudar (o mesmo risco que os ajustes de categoria já
  aceitam).
- `merchant` é reescrito por regra de categoria: não serve de chave de vínculo.
- O Postgres local (`localhost:5433/wlet`) tem **0 lançamentos**; a tela usa a semente de
  `apps/web/src/generated/`. O vínculo só funciona de ponta a ponta com o conjunto no servidor.

## Seção 1 — Modelo e como achar a compra

**O plano guarda `purchaseId?: string`**: o id de uma parcela da compra — a mais antiga visível no
momento do vínculo. Não precisa ser a 1/N: compra antiga pode ter as primeiras faturas fora dos
arquivos.

**Chave da compra:** `accountId | postedDate | rawDescription | installment.total`. Todas as parcelas
de saída (`installment` preenchido) com a mesma chave são a mesma compra.

**Leitura derivada, nunca gravada** (`InstallmentPurchase`):

- `seen`: parcelas presentes, ordenadas por `current`;
- `paidCount` / `paidAmount`: quantidade e soma (em valor absoluto) das parcelas presentes;
- `lastAmount`: valor absoluto da parcela de maior `current`;
- `estimatedTotal`: `paidAmount + (total - maior current) × lastAmount`, arredondado a centavos;
- `remainingMonths`: competências de `maior current + 1` até `total`;
- `ended`: a última parcela vista não está na fatura mais recente daquele cartão — a MESMA regra que a
  previsão já aplica para decidir se uma série continua;
- vínculo quebrado: `purchaseId` que não acha parcela no conjunto.

**Uma extração só.** A função que agrupa lançamentos em compras mora em `@wlet/domain`
(`packages/domain/src/purchases.ts`) e é usada pela previsão (`committedByCategory`) e pelo diálogo de
vínculo. Hoje o agrupamento vive dentro de `forecast.ts` com a chave `merchant | total | mês de origem`;
a troca para a chave desta seção é intencional (merchant não é estável), e seu efeito sobre o
"contratado" tem de ser MEDIDO na semente antes e depois (ver Riscos).

**Persistência:** coluna `purchase_id text` anulável em `plans` (`packages/db/src/schema/declarations.ts`)
com migration; campo `purchaseId` opcional no contrato (`packages/api/src/domains/plans/shape.ts`), no
router (`apps/api/src/routers/plans.ts`, `toPlan` e `values`), no domínio (`Plan` em
`packages/domain/src/types.ts`) e em `parsePlans`. Atravessa `replaceAll` e a exportação.

## Seção 2 — Efeito na previsão, no gráfico e na linha

Com `purchaseId`, o plano **deixa de ser previsão**:

- `buildForecast` / `expenseByCategory`, `forecastItems` e `planScheduleByMonth` **ignoram** plano com
  `purchaseId`. As parcelas restantes já entram por `sources.committed`. O mês conta uma vez.
- **Gráfico de Planos:** o plano ligado aparece só dentro da fatia "Contratado". Apontar a linha acende
  a porção dele nessa fatia (`PlanHighlight.key` ganha `'committed'`, com `byMonth` das parcelas
  restantes). "Total na agenda" continua sendo só a lista; o ⓘ ganha a frase que diz isso.
- **Linha do plano ligado** (`planos-data-table.tsx`, `plan-row-controls.tsx`):
  - caixinha marcada e desabilitada, tooltip "Compra feita";
  - forma, parcelas e mês viram texto derivado ("Parcelado · 6× · jul 26");
  - valor = `estimatedTotal`; o preço planejado aparece menor e riscado ao lado quando difere mais de
    R$ 1;
  - medidor abaixo do nome: um segmento por parcela, cheio em `--status-good` nas pagas e oco nas que
    faltam, com "2 de 6 pagas · R$ 1.874,08"; `role="img"` com `aria-label` equivalente;
  - série encerrada: medidor parado, texto "Encerrada em <mês da última parcela>";
  - vínculo quebrado: texto "Compra não encontrada" e ação de desvincular.
- **Grupo:** o checkbox do grupo ignora planos ligados (como já ignora descartados); o total do grupo
  usa `estimatedTotal` para os ligados.
- **KPIs** (`-content.tsx`, `-metric-definitions.ts`): "Decidido" soma `estimatedTotal` dos ligados;
  "Cai em" usa a parcela real do próximo mês.
- **Cor:** o verde é de SITUAÇÃO (pago), num medidor da linha — não é série de gráfico, então não
  conflita com `dataviz.md` §1 (cor é identidade da série).

## Seção 3 — Escolher a compra

- **Gatilho:** terceiro ícone nas ações da linha do plano (corrente). Coluna de ações de `w-16` para
  `w-24` (`COL_WIDTHS`). Sem vínculo, abre o diálogo; com vínculo, menu com "Trocar compra" e
  "Desvincular".
- **Diálogo** (`purchase-link-dialog.tsx` + `purchase-link-dialog-schema.ts` + teste do schema,
  `react-hook-form` + Zod como manda `forms.md`): busca por nome e lista de **compras** (uma linha por
  compra: estabelecimento, data da compra, conta, "6× R$ 937,03", total estimado, "2 de 6 pagas",
  ativa/encerrada). Seleção + botão "Vincular" no rodapé, submetendo por `formRef`.
- **Quais compras:** as de saída parceladas, ativas ou encerradas nos últimos 12 meses contados do
  último mês com dados.
- **Sugestão:** 1 ponto por critério — (1) mesmo número de parcelas do plano; (2) total estimado a até
  2% do preço do plano (parcelado; à vista se não houver); (3) mesma categoria; (4) mês da compra a até
  1 mês do mês do plano. Pontuação ≥ 3 sobe ao topo com selo "Sugerida"; o resto por data da compra,
  mais recente primeiro. Ordem, nunca corte.
- **Compra já ligada a outro plano:** listada desabilitada, "Ligada a <plano>".
- **Escrita:** `linkPurchase(planId, purchaseId)` grava o id e marca `decided`, uma escrita;
  `unlinkPurchase(planId)` remove o id e mantém a situação, uma escrita. Ligar uma compra já usada por
  outro plano lança `PurchaseAlreadyLinkedError` (novo erro de domínio). Toast
  `Plano "<plano>" ligado à compra <estabelecimento> · <N>×`. Desvincular passa por `AlertDialog`
  (`mutation-confirmation.md`).
- **Vazios:** sem compra parcelada nos arquivos, o diálogo diz isso e aponta para Meus dados; busca sem
  resultado, "Nenhuma compra com esse nome".

## Seção 4 — Testes

Runner do Node (`tsx --test`), sem DOM. Todo teste novo é conferido por mutação.

- **Domínio (`purchases.ts`):** chave agrupa as irmãs; a hospedagem estornada (mesma descrição, outra
  data) não entra; âncora que não é 1/N acha as irmãs; progresso 2 de 6 · R$ 1.874,08 · meses a cair;
  `ended` pela fatura mais recente; âncora ausente → quebrado.
- **Extração compartilhada:** testes existentes de `forecast.ts` seguem verdes; sensor de fonte
  confere que `forecast.ts` usa a função de `purchases.ts` e não reimplementa o agrupamento.
- **Previsão:** fixture Airbnb — sem vínculo o mês soma duas vezes (documenta o defeito), com vínculo
  uma vez; `planScheduleByMonth` e `forecastItems` ignoram plano ligado.
- **Ranking:** um teste por critério, desempate por data, compra ligada a outro plano indisponível.
- **Serviço de planos (fakes):** `linkPurchase` grava id e `decided` em uma escrita; `unlinkPurchase`
  remove e mantém; compra já ligada → `PurchaseAlreadyLinkedError` sem gravação; plano inexistente →
  `PlanNotFoundError` sem gravação.
- **Formato e fio:** `parsePlans` preserva `purchaseId`; migration com `purchase_id`; `wire-shape` e
  `db-columns` cobrem o campo; teste do servidor (`apps/api/tests`, Postgres real) confere que `update`
  e `replaceAll` preservam a coluna.
- **Sensores da tela:** invalidação de Planos 8 → 10 escritas; `confirmation.test.ts` ganha
  `unlinkPurchase`; `naming.md` §2 conta `*dialog*` de 6 → 9.
- **Visual:** sem teste de DOM. Conferência manual exige o conjunto no servidor (reprocessar em Meus
  dados ou importar o pacote): medidor, corrente, diálogo com sugestão, gráfico sem contagem dupla.

## Fora do escopo

- Vínculo automático no ingest.
- Fatia "paga" no gráfico ou meses passados no gráfico de Planos.
- Compras parceladas fora do cartão (boleto, carnê).
- Persistência de `from`/`to`/`note` do grupo (divergência já registrada no `CLAUDE.md`).

## Riscos

- **Troca da chave da compra na previsão.** Duas compras com mesmo estabelecimento, total e mês de
  origem eram uma só na chave antiga e passam a ser duas; o inverso (mesma compra com estabelecimento
  reescrito diferente entre faturas) deixa de se partir. Mitigação: medir `committedFor` mês a mês na
  semente antes e depois; diferença tem de ser explicada caso a caso antes de seguir.
- **Id de parcela depende do perfil da conta.** Mudança de perfil quebra o vínculo; a linha mostra
  "Compra não encontrada" em vez de esconder.
- **Servidor sem conjunto.** Enquanto o Postgres local não tiver lançamentos, a tela não tem compras
  para listar; o diálogo mostra o vazio honesto.
