import type { BillStatus } from '../api/types'

/** Calendar dates ("2026-10-07") are parsed as UTC midnight so they never shift across timezones. */
export function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const date = parseDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const shortDateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const longFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthShortFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const monthLongFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const formatDate = (iso: string) => dateFormat.format(parseDate(iso))
export const formatShortDate = (iso: string) => shortDateFormat.format(parseDate(iso))
export const formatWeekday = (iso: string) => weekdayFormat.format(parseDate(iso))
export const formatLongDate = (iso: string) => longFormat.format(parseDate(iso))

/** "2026-01" -> "Jan 2026" */
export const formatMonth = (yearMonth: string) => monthFormat.format(parseDate(`${yearMonth}-01`))
export const formatMonthShort = (yearMonth: string) => monthShortFormat.format(parseDate(`${yearMonth}-01`))
export const formatMonthLong = (yearMonth: string) => monthLongFormat.format(parseDate(`${yearMonth}-01`))

/** Instants are shown in the household's timezone. */
export function formatDateTime(instant: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant))
}

export function formatInstantDate(instant: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(
    new Date(instant),
  )
}

export function relativeTime(instant: string, now = Date.now()): string {
  const seconds = Math.round((new Date(instant).getTime() - now) / 1000)
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(seconds, 'second')
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86_400 * 30) return format.format(Math.round(seconds / 86_400), 'day')
  return formatInstantDate(instant)
}

const moneyFormats = new Map<string, Intl.NumberFormat>()

function moneyFormat(currency: string, compact = false): Intl.NumberFormat {
  const key = `${currency}:${compact}`
  let format = moneyFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(undefined, compact
      ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
      : { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    moneyFormats.set(key, format)
  }
  return format
}

/** Display only: the API sends exact decimal strings and computes every total server-side. */
export function money(amount: string | number, currency: string): string {
  return moneyFormat(currency).format(Number(amount))
}

export function moneyCompact(amount: number, currency: string): string {
  return moneyFormat(currency, true).format(amount)
}

export interface MoneyParts {
  prefix: string
  whole: string
  fraction: string
  suffix: string
}

/** Splits a formatted amount so the symbol and cents can be typeset smaller than the whole units. */
export function moneyParts(amount: string | number, currency: string): MoneyParts {
  const parts = moneyFormat(currency).formatToParts(Number(amount))
  const result: MoneyParts = { prefix: '', whole: '', fraction: '', suffix: '' }
  let seenNumber = false
  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'group' || part.type === 'minusSign') {
      result.whole += part.value
      seenNumber = true
    } else if (part.type === 'decimal' || part.type === 'fraction') {
      result.fraction += part.value
    } else if (!seenNumber) {
      result.prefix += part.value
    } else {
      result.suffix += part.value
    }
  }
  return result
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export interface DueHint {
  text: string
  tone: 'late' | 'soon' | 'calm'
}

export function dueHint(status: BillStatus, daysUntilDue: number, paidDate: string | null): DueHint {
  if (status === 'PAID') {
    return { text: paidDate ? `Paid ${formatShortDate(paidDate)}` : 'Paid', tone: 'calm' }
  }
  if (daysUntilDue < 0) {
    return { text: `${plural(-daysUntilDue, 'day')} overdue`, tone: 'late' }
  }
  if (daysUntilDue === 0) return { text: 'Due today', tone: 'soon' }
  if (daysUntilDue === 1) return { text: 'Due tomorrow', tone: 'soon' }
  if (daysUntilDue <= 7) return { text: `Due in ${daysUntilDue} days`, tone: 'soon' }
  return { text: `In ${daysUntilDue} days`, tone: 'calm' }
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileKind(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF'
  if (contentType === 'image/png') return 'PNG'
  if (contentType === 'image/jpeg') return 'JPG'
  return 'FILE'
}

export const FREQUENCY_LABEL: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
}

export function ordinal(day: number): string {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix}`
}

/** "YYYY-MM" arithmetic for analytics ranges. */
export function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const index = year * 12 + (month - 1) + delta
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
}
