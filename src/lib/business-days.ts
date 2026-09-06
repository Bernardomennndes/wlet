/**
 * Dias úteis bancários no Brasil.
 *
 * Existe para o "5º dia útil": a data de um lançamento previsto não pode ser digitada mês a
 * mês, porque ela muda com o calendário. Aqui ela é derivada.
 *
 * O calendário é o BANCÁRIO, não o de feriado legal: Carnaval e Corpus Christi são ponto
 * facultativo, mas o banco não abre e o pagamento não cai — contá-los como dia útil
 * adiantaria a data em até dois dias justamente nos meses em que eles caem cedo.
 *
 * Sem feriado estadual nem municipal: eles dependem de onde a conta está, e o config não
 * declara isso. Quem precisar de um acerta o dia na mão, com `{ kind: 'day' }`.
 *
 * Módulo puro de propósito — sem `@/`, sem dado gerado. É importado tanto pelo app quanto
 * pelo `scripts/ingest.ts`, que roda por tsx e não resolve o alias.
 */

/** Feriados nacionais de data fixa, como `MM-DD`. */
const FIXED_HOLIDAYS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde a Lei 14.759/2023)
  '12-25', // Natal
]

/**
 * Domingo de Páscoa do ano, pelo algoritmo de Meeus/Jones/Butcher para o calendário
 * gregoriano. É dele que saem os quatro feriados móveis.
 */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(date: Date, by: number): Date {
  return new Date(date.getTime() + by * 86400000)
}

/** Cache por ano: o conjunto não muda, e `nthBusinessDay` é chamado uma vez por mês exibido. */
const byYear = new Map<number, Set<string>>()

/** Feriados nacionais do ano, em `AAAA-MM-DD`, já incluindo os móveis. */
export function holidaysOf(year: number): Set<string> {
  const cached = byYear.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const holidays = new Set<string>([
    ...FIXED_HOLIDAYS.map((day) => `${year}-${day}`),
    toIso(shiftDays(easter, -48)), // segunda de Carnaval
    toIso(shiftDays(easter, -47)), // terça de Carnaval
    toIso(shiftDays(easter, -2)), // Sexta-feira Santa
    toIso(shiftDays(easter, 60)), // Corpus Christi
  ])
  byYear.set(year, holidays)
  return holidays
}

/** Não é sábado, não é domingo, não é feriado nacional. */
export function isBusinessDay(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00Z`)
  const weekday = date.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  return !holidaysOf(date.getUTCFullYear()).has(iso)
}

/**
 * O n-ésimo dia útil do mês (`AAAA-MM`), em `AAAA-MM-DD`.
 *
 * Se o mês não tiver tantos dias úteis — não acontece com n ≤ 18, mas o tipo não sabe
 * disso —, devolve o último dia útil que existir, e nunca uma data de outro mês.
 */
export function nthBusinessDay(month: string, nth: number): string {
  const [year, monthIndex] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  let seen = 0
  let last = `${month}-01`
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${month}-${String(day).padStart(2, '0')}`
    if (!isBusinessDay(iso)) continue
    seen += 1
    last = iso
    if (seen === nth) return iso
  }
  return last
}

/** O dia `day` daquele mês, encaixado no último dia quando o mês é curto (31 em fevereiro). */
export function dayOfMonth(month: string, day: number): string {
  const [year, monthIndex] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  return `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`
}
