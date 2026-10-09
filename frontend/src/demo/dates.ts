// Calendar arithmetic for the in-browser demo API, mirroring java.time's LocalDate and YearMonth.
// Dates are ISO strings ("2026-10-09") and months are "2026-10"; arithmetic runs on UTC day numbers,
// so it never crosses a daylight-saving boundary.

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const YEAR_MONTH = /^(\d{4})-(\d{2})$/

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0')

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return m >= 1 && m <= 12 && d >= 1 && d <= lengthOfMonth(y, m)
}

export function isYearMonth(value: string): boolean {
  const match = YEAR_MONTH.exec(value)
  return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12
}

export function lengthOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const toDay = (date: string) => {
  const [y, m, d] = parts(date)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)

export const addDays = (date: string, days: number) => fromDay(toDay(date) + days)

/** Whole days from {@code from} to {@code to}; negative when {@code to} is earlier. */
export const daysBetween = (from: string, to: string) => toDay(to) - toDay(from)

export const dayOfMonth = (date: string) => parts(date)[2]

export const monthValue = (date: string) => parts(date)[1]

/** LocalDate.plusMonths: the day is clamped to the length of the target month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date)
  return atDay(ymAdd(`${pad(y, 4)}-${pad(m)}`, months), d)
}

export const yearMonthOf = (date: string) => date.slice(0, 7)

export const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`

export function ymAdd(yearMonth: string, months: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`
}

/** ChronoUnit.MONTHS.between for two YearMonths. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm)
}

/** The given day inside a month, clamped to the month's last day. */
export function atDay(yearMonth: string, day: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${yearMonth}-${pad(Math.min(day, lengthOfMonth(y, m)))}`
}

export function endOfMonth(yearMonth: string): string {
  return atDay(yearMonth, 31)
}

export const later = (a: string, b: string) => (a > b ? a : b)

/** Today's date in an IANA timezone. */
export function todayIn(zone: string, now = new Date()): string {
  return localParts(zone, now.getTime()).date
}

function localParts(zone: string, epochMs: number) {
  const fields = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epochMs))
  const get = (type: string) => Number(fields.find((part) => part.type === type)?.value ?? 0)
  const [y, m, d] = [get('year'), get('month'), get('day')]
  return {
    date: `${pad(y, 4)}-${pad(m)}-${pad(d)}`,
    asUtc: Date.UTC(y, m - 1, d, get('hour'), get('minute'), get('second')),
  }
}

/** The instant at which a wall-clock time occurs in a timezone (LocalDateTime.atZone(zone).toInstant()). */
export function zonedInstant(date: string, hour: number, minute: number, zone: string): Date {
  const [y, m, d] = parts(date)
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const offset = localParts(zone, guess).asUtc - guess
    guess = wall - offset
  }
  return new Date(guess)
}

export function isValidTimezone(zone: string): boolean {
  if (zone === 'UTC') return true
  try {
    const supported = Intl.supportedValuesOf('timeZone')
    if (supported.length > 0) return supported.includes(zone)
  } catch {
    // Older engines: fall back to asking the formatter.
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone.includes('/')
  } catch {
    return false
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December']

/** "EEE d MMM yyyy", e.g. "Fri 9 Oct 2026" (reminder text). */
export function formatReminderDate(date: string): string {
  const [y, m, d] = parts(date)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "d MMMM yyyy", e.g. "9 October 2026" (statement text). */
export function formatLongDate(date: string): string {
  const [y, m, d] = parts(date)
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`
}
