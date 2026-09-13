import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { formatAxis, formatBRL, formatBRLCompact, formatDate, formatDayMonth, formatMonthLong, formatMonthLongLabel, formatMonthShort, formatPercent } from '@wlet/lib/format'

/**
 * A formatação — por onde passa TODO número e TODA data que chega à tela.
 *
 * `packages/lib` tem cinco módulos e só o `portable` tinha teste. Este é o de maior alcance: um
 * erro aqui não estoura, só faz a tela inteira mentir um pouco, do mesmo jeito, em todo lugar.
 *
 * O que mais importa aqui é uma ausência: **nenhuma função de data constrói um `Date`.** Todas
 * dividem a string ISO. É isso que as protege da armadilha que o `CLAUDE.md` descreve —
 * `new Date('2026-04-01')` é UTC e `new Date('2026-04-01T00:00')` é local, e uma data-only
 * formatada como data-hora mostra o DIA ANTERIOR. No Brasil, que é sempre a oeste de UTC, o erro
 * apareceria em todas as datas e em nenhum teste de fuso zero.
 */
const format = fileURLToPath(new URL('../../../../packages/lib/src/format.ts', import.meta.url))

describe('as datas nunca passam por `Date`', () => {
  it('o módulo não constrói `Date` em lugar nenhum', () => {
    // É um teste de FONTE porque a alternativa é indetectável no comportamento: rodando em UTC,
    // `new Date(iso).toLocaleDateString('pt-BR')` devolve o mesmo que o split — e só quebra na
    // máquina de quem usa. Trocar o split por `Date` é a "modernização" que alguém faria sem
    // saber, e o defeito chegaria a produção parecendo certo aqui.
    const source = readFileSync(format, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(source, /new Date\(/, 'formatação de data por `Date` desloca o dia conforme o fuso de quem abre a tela')
  })

  it('a data sai como está escrita, sem deslocar', () => {
    assert.equal(formatDate('2026-03-09'), '09/03/2026')
    assert.equal(formatDayMonth('2026-03-09'), '09 mar')
    // O primeiro dia do mês é o caso que a armadilha de fuso quebra: ele retrocede para o
    // último dia do mês anterior, e o número muda de mês junto.
    assert.equal(formatDate('2026-04-01'), '01/04/2026')
    assert.equal(formatDayMonth('2026-01-01'), '01 jan')
  })
})

describe('o mês é MAIÚSCULO em rótulo e minúsculo em texto corrido', () => {
  it('as três formas, e a diferença entre elas', () => {
    // Três funções para o mesmo mês não é redundância: em português o mês só leva maiúscula
    // quando não está dentro de uma frase. Unificá-las escreveria "Lançamentos de Março de 2026"
    // ou "março de 2026" num título — as duas erradas, cada uma do seu jeito.
    assert.equal(formatMonthShort('2026-03'), 'Mar 26')
    assert.equal(formatMonthLong('2026-03'), 'março de 2026')
    assert.equal(formatMonthLongLabel('2026-03'), 'Março de 2026')
  })

  it('o mês com acento sobrevive', () => {
    assert.equal(formatMonthLong('2026-03'), 'março de 2026')
    assert.equal(formatMonthShort('2026-02'), 'Fev 26')
  })

  it('dezembro e janeiro — as pontas do índice', () => {
    // O índice é `mês - 1`, e as pontas são onde um off-by-one aparece.
    assert.equal(formatMonthShort('2026-01'), 'Jan 26')
    assert.equal(formatMonthShort('2026-12'), 'Dez 26')
    assert.equal(formatMonthLong('2026-12'), 'dezembro de 2026')
  })
})

describe('dinheiro', () => {
  it('formata em pt-BR, com o símbolo', () => {
    assert.match(formatBRL(1234.5), /^R\$\s?1\.234,50$/)
    assert.match(formatBRL(-1234.5), /1\.234,50/)
  })

  it('a forma compacta só entra a partir de dez mil', () => {
    // Abaixo disso o número cabe e o compacto perderia centavos que a pessoa procura: um gasto
    // de R$ 9.999,90 lido como "R$ 10 mil" é arredondamento para cima no lugar errado.
    assert.match(formatBRLCompact(9999.9), /9\.999,90/)
    assert.match(formatBRLCompact(22_000), /22\s?mil/)
  })

  it('o eixo escreve o zero por extenso, não "R$ 0,0 mil"', () => {
    assert.equal(formatAxis(0), 'R$ 0')
    assert.match(formatAxis(5500), /5,5\s?mil/)
  })
})

describe('porcentagem', () => {
  it('a fração vira porcentagem com vírgula decimal', () => {
    assert.equal(formatPercent(0.0501), '5%')
    assert.equal(formatPercent(0.0501, 2), '5,01%')
    assert.equal(formatPercent(-0.125, 1), '-12,5%')
  })

  it('zero digits arredonda, e não trunca', () => {
    assert.equal(formatPercent(0.756), '76%')
  })
})
