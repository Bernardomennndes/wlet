import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayOfMonth, holidaysOf, isBusinessDay, nthBusinessDay } from '../../src/lib/business-days.ts'

describe('feriados', () => {
  it('deriva os quatro móveis da Páscoa de 2026 (5 de abril)', () => {
    const h = holidaysOf(2026)
    assert.ok(h.has('2026-02-16'), 'segunda de Carnaval')
    assert.ok(h.has('2026-02-17'), 'terça de Carnaval')
    assert.ok(h.has('2026-04-03'), 'Sexta-feira Santa')
    assert.ok(h.has('2026-06-04'), 'Corpus Christi')
  })

  it('traz os fixos, inclusive a Consciência Negra', () => {
    const h = holidaysOf(2027)
    for (const day of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']) {
      assert.ok(h.has(`2027-${day}`), day)
    }
  })

  it('muda de ano junto com a Páscoa', () => {
    // Páscoa de 2027 é 28 de março, então o Carnaval cai em fevereiro do MESMO ano.
    assert.ok(holidaysOf(2027).has('2027-02-08'), 'segunda de Carnaval de 2027')
    assert.equal(holidaysOf(2026).has('2027-02-08'), false)
  })
})

describe('isBusinessDay', () => {
  it('recusa sábado, domingo e feriado', () => {
    assert.equal(isBusinessDay('2026-10-03'), false, 'sábado')
    assert.equal(isBusinessDay('2026-10-04'), false, 'domingo')
    assert.equal(isBusinessDay('2027-01-01'), false, 'Confraternização')
    assert.equal(isBusinessDay('2026-10-05'), true, 'segunda comum')
  })
})

describe('nthBusinessDay', () => {
  it('pula o fim de semana', () => {
    // out/26: 1 qui, 2 sex, 5 seg, 6 ter, 7 qua.
    assert.equal(nthBusinessDay('2026-10', 5), '2026-10-07')
  })

  it('pula o feriado no meio da contagem', () => {
    // nov/26: dia 2 é Finados, então o 5º dia útil escorrega para a segunda seguinte.
    assert.equal(nthBusinessDay('2026-11', 5), '2026-11-09')
  })

  it('pula o feriado que abre o mês', () => {
    // 1º de janeiro de 2027 é sexta-feira e feriado.
    assert.equal(nthBusinessDay('2027-01', 5), '2027-01-08')
  })

  it('nunca sai do mês quando o n é grande demais', () => {
    const last = nthBusinessDay('2026-02', 40)
    assert.ok(last.startsWith('2026-02'), last)
    assert.equal(isBusinessDay(last), true)
  })

  it('o primeiro dia útil é o primeiro dia quando ele é útil', () => {
    assert.equal(nthBusinessDay('2026-10', 1), '2026-10-01')
  })
})

describe('dayOfMonth', () => {
  it('encaixa o dia no último quando o mês é curto', () => {
    assert.equal(dayOfMonth('2026-02', 31), '2026-02-28')
    assert.equal(dayOfMonth('2028-02', 31), '2028-02-29', 'bissexto')
    assert.equal(dayOfMonth('2026-10', 25), '2026-10-25')
  })
})
