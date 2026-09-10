/**
 * O vocabulário único de tom de todo KPI do app.
 *
 * `default` deliberadamente NÃO é cor: um KPI é neutro até que algo sobre o valor diga o
 * contrário. Tom é leitura do número, nunca decoração — se todo cartão da tela está
 * colorido, nenhum está destacado.
 *
 * As classes usam os tokens `--status-*` deste projeto, e não os `text-destructive`,
 * `text-warning` e `text-success` do original: são os mesmos tokens que a lista de meses, o
 * controle de orçamento e os badges de status já usam aqui, então um KPI em risco fica da
 * mesma cor que um mês no vermelho.
 */
export type KpiTone = 'default' | 'risk' | 'muted' | 'warning' | 'success'

export const kpiToneClasses: Record<KpiTone, string> = {
  default: 'text-foreground',
  risk: 'text-[var(--status-critical)]',
  muted: 'text-muted-foreground',
  warning: 'text-[var(--status-warning)]',
  success: 'text-[var(--status-good-text)]',
}
