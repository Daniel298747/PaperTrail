// Domain rules shared by the demo API and its seeder, ported from the Spring services: the recurrence rule,
// recurring bill generation, reminders, derived bill status and the response shapes.

import type {
  Account,
  AppNotification,
  BillDetail,
  BillStatus,
  BillSummary,
  DocumentVersion,
  NamedRef,
  Schedule,
} from '../api/types'
import {
  addDays,
  atDay,
  daysBetween,
  firstOfMonth,
  formatReminderDate,
  later,
  monthsBetween,
  todayIn,
  yearMonthOf,
  ymAdd,
} from './dates'
import type { BillRow, Db, DocumentRow, Frequency, NotificationType, ScheduleRow, UserRow } from './store'
import { displayMoney, formatCents, uuid } from './util'

const FREQUENCY_MONTHS: Record<Frequency, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 }

/** Days ahead that recurring bills are generated (app.jobs.horizon-days). */
export const HORIZON_DAYS = 30
const OVERDUE_LOOKBACK_DAYS = 7
const UPCOMING_PREVIEW = 4

// ---------------------------------------------------------------------------------------------------------
// Recurrence rule: the first occurrence is the first billing day on or after the start date; later ones fall
// every N months after it, each computed from the anchor day, so the 31st lands on 28/29 Feb and returns.

export interface Rule {
  startDate: string
  billingDay: number
  frequency: Frequency
}

function firstOccurrence(rule: Rule): string {
  const startMonth = yearMonthOf(rule.startDate)
  const candidate = atDay(startMonth, rule.billingDay)
  return candidate < rule.startDate ? atDay(ymAdd(startMonth, 1), rule.billingDay) : candidate
}

function occurrence(rule: Rule, index: number): string {
  return atDay(ymAdd(yearMonthOf(firstOccurrence(rule)), index * FREQUENCY_MONTHS[rule.frequency]),
    rule.billingDay)
}

function startIndex(rule: Rule, from: string): number {
  const monthsToFrom = monthsBetween(yearMonthOf(firstOccurrence(rule)), yearMonthOf(from))
  return Math.max(0, Math.trunc(monthsToFrom / FREQUENCY_MONTHS[rule.frequency]) - 1)
}

/** All occurrences with from <= date <= to, ascending. */
export function occurrencesBetween(rule: Rule, from: string, to: string): string[] {
  const result: string[] = []
  if (to < from) return result
  for (let index = startIndex(rule, from); ; index++) {
    const date = occurrence(rule, index)
    if (date > to) return result
    if (date >= from) result.push(date)
  }
}

/** The next {@code count} occurrences on or after {@code from}. */
export function nextOccurrences(rule: Rule, from: string, count: number): string[] {
  const result: string[] = []
  for (let index = startIndex(rule, from); result.length < count; index++) {
    const date = occurrence(rule, index)
    if (date >= from) result.push(date)
  }
  return result
}

// ---------------------------------------------------------------------------------------------------------
// Lookups

export const householdToday = (user: UserRow, now = new Date()) => todayIn(user.timezone, now)

export function requireRow<T extends { id: string; userId: string }>(rows: T[], id: string, userId: string,
  onMissing: () => Error): T {
  const row = rows.find((candidate) => candidate.id === id && candidate.userId === userId)
  if (!row) throw onMissing()
  return row
}

const providerName = (db: Db, id: string) => db.providers.find((p) => p.id === id)?.name ?? ''
const categoryName = (db: Db, id: string) => db.categories.find((c) => c.id === id)?.name ?? ''

export const providerRef = (db: Db, id: string): NamedRef => ({ id, name: providerName(db, id) })
export const categoryRef = (db: Db, id: string): NamedRef => ({ id, name: categoryName(db, id) })

function scheduleRef(db: Db, id: string | null): NamedRef | null {
  if (id === null) return null
  const schedule = db.schedules.find((s) => s.id === id)
  return schedule ? { id, name: schedule.title } : null
}

/** An unpaid bill whose due date is before today (household timezone) is overdue. */
export function effectiveStatus(bill: BillRow, today: string): BillStatus {
  if (bill.status === 'PAID') return 'PAID'
  return bill.dueDate < today ? 'OVERDUE' : 'UNPAID'
}

export const currencyLocked = (db: Db, userId: string) =>
  db.bills.some((b) => b.userId === userId) || db.schedules.some((s) => s.userId === userId)

/** Newest version first. */
export const documentsOf = (db: Db, billId: string) =>
  db.documents.filter((d) => d.billId === billId).sort((a, b) => b.versionNumber - a.versionNumber)

// ---------------------------------------------------------------------------------------------------------
// Responses

export function accountResponse(db: Db, user: UserRow, now = new Date()): Account {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    currency: user.currency,
    timezone: user.timezone,
    defaultReminderLeadDays: user.defaultReminderLeadDays,
    today: householdToday(user, now),
    currencyLocked: currencyLocked(db, user.id),
    createdAt: user.createdAt,
  }
}

export function billSummary(db: Db, bill: BillRow, today: string): BillSummary {
  return {
    id: bill.id,
    title: bill.title,
    provider: providerRef(db, bill.providerId),
    category: categoryRef(db, bill.categoryId),
    amount: formatCents(bill.amountCents),
    currency: bill.currency,
    dueDate: bill.dueDate,
    status: effectiveStatus(bill, today),
    paidDate: bill.paidDate,
    daysUntilDue: daysBetween(today, bill.dueDate),
    documentCount: db.documents.filter((d) => d.billId === bill.id).length,
    schedule: scheduleRef(db, bill.scheduleId),
    version: bill.version,
  }
}

export function documentResponse(document: DocumentRow, latest: boolean): DocumentVersion {
  return {
    id: document.id,
    billId: document.billId,
    versionNumber: document.versionNumber,
    filename: document.filename,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    sha256: document.sha256,
    uploadedAt: document.uploadedAt,
    latest,
  }
}

export function billDetail(db: Db, bill: BillRow, today: string): BillDetail {
  return {
    id: bill.id,
    title: bill.title,
    provider: providerRef(db, bill.providerId),
    category: categoryRef(db, bill.categoryId),
    amount: formatCents(bill.amountCents),
    currency: bill.currency,
    dueDate: bill.dueDate,
    status: effectiveStatus(bill, today),
    paidDate: bill.paidDate,
    daysUntilDue: daysBetween(today, bill.dueDate),
    reminderLeadDays: bill.reminderLeadDays,
    notes: bill.notes,
    schedule: scheduleRef(db, bill.scheduleId),
    documents: documentsOf(db, bill.id).map((d, i) => documentResponse(d, i === 0)),
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
    version: bill.version,
  }
}

export function scheduleResponse(db: Db, s: ScheduleRow, today: string): Schedule {
  const ledger = db.occurrences.filter((o) => o.scheduleId === s.id)
  const lastGenerated = ledger.reduce<string | null>(
    (latest, o) => (latest === null || o.occurrenceDate > latest ? o.occurrenceDate : latest), null)
  return {
    id: s.id,
    title: s.title,
    provider: providerRef(db, s.providerId),
    category: categoryRef(db, s.categoryId),
    amount: formatCents(s.amountCents),
    currency: s.currency,
    frequency: s.frequency,
    startDate: s.startDate,
    billingDay: s.billingDay,
    reminderLeadDays: s.reminderLeadDays,
    active: s.active,
    notes: s.notes,
    upcoming: nextOccurrences(s, later(s.startDate, today), UPCOMING_PREVIEW),
    lastGenerated,
    generatedCount: ledger.length,
    createdAt: s.createdAt,
    version: s.version,
  }
}

export function notificationResponse(db: Db, n: Db['notifications'][number], today: string): AppNotification {
  const bill = db.bills.find((b) => b.id === n.billId)
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    referenceDate: n.referenceDate,
    createdAt: n.createdAt,
    readAt: n.readAt,
    bill: bill ? {
      id: bill.id,
      title: bill.title,
      providerName: providerName(db, bill.providerId),
      amount: formatCents(bill.amountCents),
      currency: bill.currency,
      dueDate: bill.dueDate,
      status: effectiveStatus(bill, today),
    } : null,
  }
}

// ---------------------------------------------------------------------------------------------------------
// Jobs

export function newBill(fields: Omit<BillRow, 'id' | 'status' | 'paidDate' | 'createdAt' | 'updatedAt' | 'version'>,
  now: Date): BillRow {
  const stamp = now.toISOString()
  return { id: uuid(), status: 'UNPAID', paidDate: null, createdAt: stamp, updatedAt: stamp, version: 0, ...fields }
}

/**
 * Creates the schedule's bills due within the horizon. Only cycles on or after max(start date, today, day after
 * the last generated occurrence) are created, and each cycle month is claimed once in the ledger, so editing a
 * schedule affects future bills only and repeated runs never duplicate a bill.
 */
export function generateForSchedule(db: Db, schedule: ScheduleRow, now: Date): BillRow[] {
  if (!schedule.active) return []
  const owner = db.users.find((u) => u.id === schedule.userId)
  if (!owner) return []
  const today = householdToday(owner, now)
  let windowStart = later(schedule.startDate, today)
  const ledger = db.occurrences.filter((o) => o.scheduleId === schedule.id)
  if (ledger.length > 0) {
    const last = ledger.reduce((max, o) => (o.occurrenceDate > max ? o.occurrenceDate : max), ledger[0].occurrenceDate)
    windowStart = later(windowStart, addDays(last, 1))
  }
  const generated: BillRow[] = []
  for (const dueDate of occurrencesBetween(schedule, windowStart, addDays(today, HORIZON_DAYS))) {
    const cycleMonth = firstOfMonth(dueDate)
    if (ledger.some((o) => o.cycleMonth === cycleMonth)) continue
    const bill = newBill({
      userId: schedule.userId,
      title: schedule.title,
      providerId: schedule.providerId,
      categoryId: schedule.categoryId,
      amountCents: schedule.amountCents,
      currency: schedule.currency,
      dueDate,
      reminderLeadDays: schedule.reminderLeadDays,
      notes: null,
      scheduleId: schedule.id,
    }, now)
    db.bills.push(bill)
    const entry = { scheduleId: schedule.id, cycleMonth, occurrenceDate: dueDate, billId: bill.id }
    db.occurrences.push(entry)
    ledger.push(entry)
    generated.push(bill)
  }
  return generated
}

function relative(days: number): string {
  if (days === 0) return 'today'
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

export function insertNotification(db: Db, bill: BillRow, type: NotificationType, title: string, body: string,
  createdAt: string, readAt: string | null = null): boolean {
  const duplicate = db.notifications.some((n) =>
    n.billId === bill.id && n.type === type && n.referenceDate === bill.dueDate)
  if (duplicate) return false
  db.notifications.push({
    id: uuid(),
    userId: bill.userId,
    billId: bill.id,
    type,
    referenceDate: bill.dueDate,
    title: title.length <= 200 ? title : `${title.slice(0, 199)}…`,
    body: body.length <= 500 ? body : `${body.slice(0, 499)}…`,
    createdAt,
    readAt,
    seq: ++db.seq,
  })
  return true
}

/**
 * Due soon: an unpaid bill within its reminder lead time of today. Overdue: an unpaid bill past its due date,
 * sent for bills overdue by up to a week. Each (bill, type, due date) is reminded once.
 */
export function createReminders(db: Db, userId: string, now: Date): number {
  const owner = db.users.find((u) => u.id === userId)
  if (!owner) return 0
  const today = householdToday(owner, now)
  let created = 0
  for (const bill of db.bills) {
    if (bill.userId !== userId || bill.status !== 'UNPAID') continue
    const days = daysBetween(today, bill.dueDate)
    const amount = displayMoney(bill.amountCents, bill.currency)
    const provider = providerName(db, bill.providerId)
    if (days < 0 && days >= -OVERDUE_LOOKBACK_DAYS) {
      if (insertNotification(db, bill, 'BILL_OVERDUE', `${provider} bill is overdue`,
        `${amount} for ${bill.title} was due ${formatReminderDate(bill.dueDate)}. Mark it paid once settled.`,
        now.toISOString())) created++
    } else if (days >= 0 && days <= bill.reminderLeadDays) {
      if (insertNotification(db, bill, 'BILL_DUE_SOON', `${provider} bill due ${relative(days)}`,
        `${amount} for ${bill.title} is due ${formatReminderDate(bill.dueDate)}.`, now.toISOString())) created++
    }
  }
  return created
}

/** The scheduled job, run for one household: generate upcoming bills, then issue reminders. */
export function runJobs(db: Db, userId: string, now: Date) {
  for (const schedule of db.schedules) {
    if (schedule.userId === userId && schedule.active) generateForSchedule(db, schedule, now)
  }
  createReminders(db, userId, now)
}
