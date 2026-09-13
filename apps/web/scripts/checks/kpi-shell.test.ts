import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * O número de destaque sai de `@/components/kpi` — e a lista de exceções não CRESCE.
 *
 * A §8 de `kpi-cards.md` inventaria cinco cartões montados à mão, cada um com a sua razão, e fecha
 * com: "PROIBIDO usar esta lista como precedente: ela existe para ser esvaziada, não para
 * justificar o sexto cartão à mão". Era prosa, e prosa não segura lista.
 *
 * O que se perde no cartão à mão não é estilo: os três shells exigem `MetricDefinition` no TIPO, e
 * é ela que vira o ⓘ explicando como o número foi calculado. Um `<div>` com `text-3xl` não exige
 * nada — o número chega à tela sem dizer de onde veio, e essa é exatamente a informação que separa
 * "meu patrimônio caiu" de "o filtro de período começa depois do primeiro aporte".
 *
 * **A assinatura é estreita de propósito: número grande em fonte mono.** Foi medida — pega os três
 * cartões de cifra da §8 e mais nada, zero falso positivo. Os outros dois da tabela
 * (`budget-card`, `spending-overview-card`) não aparecem aqui porque não são número de destaque:
 * são medidores com barra de progresso, e a própria §8 diz isso. Uma heurística mais larga
 * (`<Card>` + texto grande) acusava o `simulation-card`, que é uma lista de interruptores — e
 * sensor que acusa código certo é sensor que alguém desliga.
 */
const webSrc = fileURLToPath(new URL('../../src/', import.meta.url))

/**
 * Os cinco da §8, com o impedimento de cada um. A lista é o registro da decisão, não anistia.
 *
 * Os dois de `patrimonio` que vivem na superfície `--hero` são DECISÃO e não dívida: aquela
 * superfície inverte com o tema, e o `HeroKpiCard` desenha um `<Card>` comum — convertê-los como o
 * shell é hoje os despintaria. O que falta neles é só a `definition`.
 */
const HAND_BUILT: Record<string, string> = {
  'routes/-components/budget-card.tsx': 'medidor com barra, não cifra — cabe no HeroKpiCard',
  'routes/-components/spending-overview-card.tsx': 'idem, e tem CardAction no cabeçalho, que o HeroKpiCard não tem',
  'routes/patrimonio/-components/income-card.tsx': 'candidato direto a SecondaryKpiGrid',
  'routes/patrimonio/-components/patrimony-hero.tsx': 'superfície --hero, que o shell não sabe desenhar',
  'routes/patrimonio/-components/benchmark-card.tsx': 'idem',
}

/** Uma cifra de destaque: mono e grande na MESMA classe. É a forma do número que o shell desenha. */
const PROMINENT_NUMBER = /class[Nn]ame="[^"]*\bfont-mono\b[^"]*\btext-(?:2xl|3xl|4xl)\b[^"]*"|class[Nn]ame="[^"]*\btext-(?:2xl|3xl|4xl)\b[^"]*\bfont-mono\b[^"]*"/

function tsxFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...tsxFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`))
    else if (entry.name.endsWith('.tsx')) out.push(`${prefix}${entry.name}`)
  }
  return out
}

describe('o número de destaque vem do shell de KPI', () => {
  const files = tsxFiles(webSrc)

  it('há arquivo sendo lido — o varredor não parou de olhar', () => {
    assert.ok(files.length >= 40, `só ${files.length} componentes varridos`)
  })

  it('nenhuma cifra grande montada fora dos shells, além das declaradas', () => {
    const offenders = files.filter((relative) => {
      const source = readFileSync(`${webSrc}${relative}`, 'utf8')
      return PROMINENT_NUMBER.test(source) && !/<(?:KpiCard|KpiHeadline|HeroKpiCard|SecondaryKpiGrid)\b/.test(source)
    })
    const undeclared = offenders.filter((relative) => !(relative in HAND_BUILT))
    assert.deepEqual(
      undeclared,
      [],
      'cifra de destaque montada à mão: use `KpiCard`/`KpiHeadline`/`HeroKpiCard`, que exigem a `MetricDefinition` do ⓘ. A lista da §8 existe para ser esvaziada, não para justificar o próximo',
    )
  })

  it('e a lista de exceções não virou sedimento', () => {
    const stale: string[] = []
    for (const relative of Object.keys(HAND_BUILT)) {
      if (!existsSync(`${webSrc}${relative}`)) {
        stale.push(`${relative}: o arquivo sumiu`)
        continue
      }
      // Convergiu é usar um SHELL, não importar de `components/kpi`. A primeira versão desta
      // linha confundiu as duas e acusou os dois cartões de `--hero` no dia em que eles ganharam o
      // ⓘ — que é justamente o passo que a §8 pede deles enquanto o shell não sabe desenhar aquela
      // superfície. Ganhar a `definition` não é converter; é parar de esconder o cálculo.
      if (/<(?:KpiCard|KpiHeadline|HeroKpiCard|SecondaryKpiGrid)\b/.test(readFileSync(`${webSrc}${relative}`, 'utf8'))) stale.push(`${relative}: já usa o shell`)
    }
    assert.deepEqual(stale, [], 'entrada da lista que não descreve mais a realidade — tire-a, senão ela vira licença para um cartão que já convergiu')
  })
})
