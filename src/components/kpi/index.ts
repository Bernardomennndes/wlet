/**
 * A família de KPI — o único jeito deste app desenhar um número de destaque.
 *
 * Três shells sobre um contrato (`MetricDefinition`): `KpiCard` para a célula de uma
 * fileira, `SecondaryKpiGrid` para o conjunto denso, e `HeroKpiCard` para a métrica cujo
 * corpo é um desenho e não uma cifra. `KpiHeadline` é o quarto e é próprio daqui: o mesmo
 * miolo sem espaçamento de célula, para o número que ancora um gráfico.
 *
 * Todos exigem a definição, então nenhum KPI chega à tela sem dizer como foi calculado.
 *
 * Replicado da família de KPI de um painel irmão. Duas diferenças declaradas: o
 * `KpiNumber`/NumberFlow ficou de fora porque toda chamada daqui passa string já formatada
 * por `@/lib/format` — lá a string renderiza estática, então a dependência não teria
 * consumidor; e os tons usam os tokens `--status-*` deste projeto.
 */
export { HeroKpiCard } from './hero-kpi-card'
export { KpiCard, KpiHeadline } from './kpi-card'
export { KpiCardGrid, KpiCardSkeleton, type KpiCardGridColumns } from './kpi-card-grid'
export { kpiToneClasses, type KpiTone } from './kpi-tone'
export { KpiValue } from './kpi-value'
export { MetricInfoPopover, type MetricDefinition } from './metric-info-popover'
export { SecondaryKpiGrid, type SecondaryKpiItem } from './secondary-kpi-grid'
