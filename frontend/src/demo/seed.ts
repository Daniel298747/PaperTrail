// The demo household, ported from the backend's DemoDataSeeder. Dates are relative to "today" in
// Europe/Dublin, so the demo always has a year of paid history, two overdue bills, bills due this week and
// upcoming instances created by the same generation job the API runs.

import { addDays, addMonths, firstOfMonth, formatReminderDate, monthValue, todayIn, zonedInstant } from './dates'
import { receiptImage, statementLines, statementPdf } from './documents'
import { createReminders, generateForSchedule, insertNotification, newBill, occurrencesBetween } from './domain'
import type { BillRow, Db, DocumentSource, Frequency, ProviderRow, ScheduleRow, StatementSpec } from './store'
import { displayMoney, roundCents, seededRandom, sha256Hex, uuid } from './util'

export const DEMO_EMAIL = 'demo@papertrail.local'
export const DEMO_PASSWORD = 'paper-trail-demo'

export const STARTER_CATEGORIES = ['Electricity', 'Gas', 'Broadband', 'Mobile', 'Insurance', 'Rent', 'Water',
  'Subscriptions']

const ZONE = 'Europe/Dublin'
const HOUSEHOLD = 'The Byrne household'
const ELECTRICITY_SEASON = [1.30, 1.24, 1.12, 0.98, 0.88, 0.80, 0.78, 0.80, 0.88, 1.00, 1.15, 1.32]
const GAS_SEASON = [1.75, 1.60, 1.35, 1.00, 0.66, 0.46, 0.40, 0.42, 0.60, 0.95, 1.35, 1.70]

type Season = 'NONE' | 'ELECTRICITY' | 'GAS' | 'PRICE_RISE'

export async function hashPassword(password: string, salt: string) {
  return sha256Hex(`${salt}:${password}`)
}

export function starterCategories(db: Db, userId: string) {
  for (const name of STARTER_CATEGORIES) db.categories.push({ id: uuid(), userId, name })
}

export async function seedDemoHousehold(db: Db, now = new Date()): Promise<string> {
  const today = todayIn(ZONE, now)
  const stamp = now.toISOString()
  const userId = uuid()
  const passwordSalt = uuid()
  db.users.push({
    id: userId,
    email: DEMO_EMAIL,
    passwordSalt,
    passwordHash: await hashPassword(DEMO_PASSWORD, passwordSalt),
    displayName: HOUSEHOLD,
    currency: 'EUR',
    timezone: ZONE,
    defaultReminderLeadDays: 3,
    createdAt: stamp,
  })
  starterCategories(db, userId)
  db.categories.push({ id: uuid(), userId, name: 'Home maintenance' })
  const categoryId = (name: string) => db.categories.find((c) => c.userId === userId && c.name === name)!.id

  const providers = new Map<string, ProviderRow>()
  for (const [name, category] of [
    ['Quayside Lettings', 'Rent'], ['Lumenfield Energy', 'Electricity'], ['Northgate Gas', 'Gas'],
    ['Fibrelane', 'Broadband'], ['Kestrel Mobile', 'Mobile'], ['Riverbend Water', 'Water'],
    ['Harbour Mutual', 'Insurance'], ['Northlight Streaming', 'Subscriptions'],
    ['Hearthside Heating', 'Home maintenance'], ['Clearpane Window Care', 'Home maintenance'],
  ]) {
    const provider = { id: uuid(), userId, name, defaultCategoryId: categoryId(category) }
    db.providers.push(provider)
    providers.set(name, provider)
  }
  const provider = (name: string) => providers.get(name)!

  const random = seededRandom(20261007)
  const history = new Map<string, BillRow[]>()

  /** offset = days from today to this cycle's due date; with currentOverdue that cycle stays unpaid. */
  function seedSchedule(title: string, owner: ProviderRow, frequency: Frequency, baseCents: number,
    offsetDays: number | null, leadDays: number, currentOverdue: boolean, season: Season, fixedBillingDay: number) {
    const anchor = offsetDays === null ? null : addDays(today, offsetDays)
    const billingDay = anchor === null ? fixedBillingDay : Number(anchor.slice(8))
    const reference = anchor ?? today
    const start = firstOfMonth(frequency === 'MONTHLY' ? addMonths(reference, -13)
      : frequency === 'QUARTERLY' ? addMonths(reference, -15) : addMonths(reference, -24))
    const schedule: ScheduleRow = {
      id: uuid(),
      userId,
      title,
      providerId: owner.id,
      categoryId: owner.defaultCategoryId!,
      amountCents: baseCents,
      currency: 'EUR',
      frequency,
      startDate: start,
      billingDay,
      reminderLeadDays: leadDays,
      active: true,
      notes: null,
      createdAt: stamp,
      updatedAt: stamp,
      version: 0,
    }
    db.schedules.push(schedule)
    const bills: BillRow[] = []
    for (const due of occurrencesBetween(schedule, start, addDays(today, -1))) {
      const bill = newBill({
        userId,
        title,
        providerId: schedule.providerId,
        categoryId: schedule.categoryId,
        amountCents: seasonal(baseCents, season, due),
        currency: 'EUR',
        dueDate: due,
        reminderLeadDays: leadDays,
        notes: null,
        scheduleId: schedule.id,
      }, now)
      if (!(currentOverdue && due === anchor)) {
        bill.status = 'PAID'
        bill.paidDate = paymentDate(owner, due)
      }
      db.bills.push(bill)
      db.occurrences.push({ scheduleId: schedule.id, cycleMonth: firstOfMonth(due), occurrenceDate: due, billId: bill.id })
      bills.push(bill)
    }
    history.set(title, bills)
  }

  /**
   * Rent goes out by standing order on the due date; other bills are paid up to a few days early or a couple
   * of days late, but within the month they fall due, so monthly paid totals stay comparable.
   */
  function paymentDate(owner: ProviderRow, due: string): string {
    let paid = owner.defaultCategoryId === categoryId('Rent') ? due
      : addDays(due, -random.nextInt(5) + (random.nextInt(4) === 0 ? 2 : 0))
    if (paid.slice(0, 7) !== due.slice(0, 7)) paid = due
    return paid > today ? today : paid
  }

  function seasonal(baseCents: number, season: Season, due: string): number {
    if (season === 'PRICE_RISE' && due < addMonths(today, -5)) return 4499
    if (season === 'NONE' || season === 'PRICE_RISE') return baseCents
    const factor = (season === 'ELECTRICITY' ? ELECTRICITY_SEASON : GAS_SEASON)[monthValue(due) - 1]
    const noise = 0.95 + random.nextDouble() * 0.10
    return roundCents(baseCents * factor * noise)
  }

  seedSchedule('Monthly rent', provider('Quayside Lettings'), 'MONTHLY', 165000, null, 5, false, 'NONE', 1)
  seedSchedule('Electricity', provider('Lumenfield Energy'), 'MONTHLY', 9600, 4, 5, false, 'ELECTRICITY', 0)
  seedSchedule('Gas', provider('Northgate Gas'), 'MONTHLY', 7400, 12, 3, false, 'GAS', 0)
  seedSchedule('Home broadband', provider('Fibrelane'), 'MONTHLY', 4999, -3, 3, true, 'PRICE_RISE', 0)
  seedSchedule('Mobile, two lines', provider('Kestrel Mobile'), 'MONTHLY', 3800, 2, 3, false, 'NONE', 0)
  seedSchedule('Water charges', provider('Riverbend Water'), 'QUARTERLY', 9640, -6, 7, true, 'NONE', 0)
  seedSchedule('Streaming subscription', provider('Northlight Streaming'), 'MONTHLY', 1399, 20, 1, false, 'NONE', 0)
  seedSchedule('Home insurance', provider('Harbour Mutual'), 'ANNUAL', 48600, 26, 14, false, 'NONE', 0)
  seedSchedule('Car insurance', provider('Harbour Mutual'), 'ANNUAL', 71200, -150, 14, false, 'NONE', 0)

  function oneOff(title: string, owner: ProviderRow, cents: number, due: string, paidOn: string | null,
    notes: string | null): BillRow {
    const bill = newBill({
      userId,
      title,
      providerId: owner.id,
      categoryId: owner.defaultCategoryId!,
      amountCents: cents,
      currency: 'EUR',
      dueDate: due,
      reminderLeadDays: 3,
      notes,
      scheduleId: null,
    }, now)
    if (paidOn !== null) {
      bill.status = 'PAID'
      bill.paidDate = paidOn
    }
    db.bills.push(bill)
    return bill
  }

  const heating = provider('Hearthside Heating')
  const boiler = oneOff('Annual boiler service', heating, 14500, addDays(today, -118), addDays(today, -120),
    'Service and carbon monoxide check.')
  const windows = oneOff('Window cleaning', provider('Clearpane Window Care'), 4000, addDays(today, -45),
    addDays(today, -45), null)
  oneOff('Chimney sweep', heating, 9000, addDays(today, 9), null, 'Booked for the morning; pay on the day.')

  // Statements
  async function upload(bill: BillRow, filename: string, source: DocumentSource, bytes: Uint8Array,
    uploadedOn: string) {
    const day = uploadedOn > today ? today : uploadedOn
    const versionNumber = db.documents.filter((d) => d.billId === bill.id).length + 1
    db.documents.push({
      id: uuid(),
      userId,
      billId: bill.id,
      versionNumber,
      filename,
      contentType: source.kind === 'receipt'
        ? (source.receipt.format === 'jpg' ? 'image/jpeg' : 'image/png') : 'application/pdf',
      sizeBytes: bytes.length,
      sha256: await sha256Hex(bytes),
      uploadedAt: zonedInstant(day, 9, 12, ZONE).toISOString(),
      source,
    })
  }

  function statement(bill: BillRow, documentTitle: string, reference: string, totalCents: number,
    note: string | null): StatementSpec {
    const due = bill.dueDate
    return {
      provider: db.providers.find((p) => p.id === bill.providerId)!.name,
      documentTitle,
      accountReference: reference,
      householdName: HOUSEHOLD,
      issued: addDays(due, -14),
      periodStart: addDays(addMonths(due, -1), -14),
      periodEnd: addDays(due, -15),
      dueDate: due,
      totalCents,
      lines: statementLines(totalCents, 'Usage and service charges', 'Standing charge', 'VAT'),
      note,
    }
  }

  async function uploadStatement(bill: BillRow, filename: string, spec: StatementSpec, uploadedOn: string) {
    await upload(bill, filename, { kind: 'statement', statement: spec }, statementPdf(spec), uploadedOn)
  }

  const last = <T>(items: T[], count: number) => items.slice(Math.max(0, items.length - count))

  const electricity = history.get('Electricity')!
  for (const bill of last(electricity, 3)) {
    if (bill === electricity[electricity.length - 1]) {
      // Estimated statement first, then the corrected one after an actual meter reading.
      await uploadStatement(bill, `lumenfield-statement-${bill.dueDate}.pdf`,
        statement(bill, 'Electricity statement (estimated reading)', 'LE-20417-883', bill.amountCents + 720,
          'Estimated reading. Submit a meter reading for an exact bill.'), addDays(bill.dueDate, -12))
      await uploadStatement(bill, `lumenfield-statement-${bill.dueDate}-revised.pdf`,
        statement(bill, 'Electricity statement (revised)', 'LE-20417-883', bill.amountCents,
          'Revised: actual meter reading replaces the estimate.'), addDays(bill.dueDate, -8))
    } else {
      await uploadStatement(bill, `lumenfield-statement-${bill.dueDate}.pdf`,
        statement(bill, 'Electricity statement', 'LE-20417-883', bill.amountCents, null), addDays(bill.dueDate, -12))
    }
  }
  for (const bill of last(history.get('Gas')!, 2)) {
    await uploadStatement(bill, `northgate-gas-${bill.dueDate}.pdf`,
      statement(bill, 'Gas statement', 'NG-5530-118', bill.amountCents, null), addDays(bill.dueDate, -10))
  }
  for (const bill of last(history.get('Home broadband')!, 2)) {
    await uploadStatement(bill, `fibrelane-invoice-${bill.dueDate}.pdf`,
      statement(bill, 'Broadband invoice', 'FL-0098-7712', bill.amountCents, null), addDays(bill.dueDate, -9))
  }
  const [overdueWater] = last(history.get('Water charges')!, 1)
  await uploadStatement(overdueWater, `riverbend-water-${overdueWater.dueDate}.pdf`,
    statement(overdueWater, 'Water charges', 'RW-3381-02', overdueWater.amountCents, null),
    addDays(overdueWater.dueDate, -21))
  await uploadStatement(overdueWater, `riverbend-water-${overdueWater.dueDate}-corrected.pdf`,
    statement(overdueWater, 'Water charges (corrected account reference)', 'RW-3381-20', overdueWater.amountCents,
      'Corrected account reference. Charges are unchanged.'), addDays(overdueWater.dueDate, -15))
  const [lastRent] = last(history.get('Monthly rent')!, 1)
  await uploadStatement(lastRent, `quayside-rent-receipt-${lastRent.dueDate}.pdf`,
    statement(lastRent, 'Rent statement, Apartment 4', 'QL-APT4', lastRent.amountCents, null),
    addDays(lastRent.dueDate, 1))
  const [lastMobile] = last(history.get('Mobile, two lines')!, 1)
  await uploadStatement(lastMobile, `kestrel-mobile-${lastMobile.dueDate}.pdf`,
    statement(lastMobile, 'Mobile bill, 2 lines', 'KM-7743-11', lastMobile.amountCents, null),
    addDays(lastMobile.dueDate, -7))
  for (const insurance of ['Home insurance', 'Car insurance']) {
    const [policy] = last(history.get(insurance)!, 1)
    await uploadStatement(policy, `${insurance.toLowerCase().replace(/ /g, '-')}-renewal-${policy.dueDate}.pdf`,
      statement(policy, `${insurance} renewal schedule`, `HM-POL-${insurance.startsWith('Home') ? '4410' : '9902'}`,
        policy.amountCents, 'Annual premium. Cover runs for twelve months from the due date.'),
      addDays(policy.dueDate, -25))
  }
  for (const [bill, filename, description, format] of [
    [boiler, 'boiler-service-receipt.jpg', 'Annual boiler service', 'jpg'],
    [windows, 'window-cleaning-receipt.png', 'Window cleaning, front and back', 'png'],
  ] as const) {
    const receipt = {
      provider: db.providers.find((p) => p.id === bill.providerId)!.name,
      description,
      amountCents: bill.amountCents,
      date: bill.paidDate!,
      format,
    }
    await upload(bill, filename, { kind: 'receipt', receipt }, await receiptImage(receipt), bill.paidDate!)
  }

  // Let the generation job create the upcoming instances, then fill in the one statement that has arrived.
  for (const schedule of db.schedules.filter((s) => s.userId === userId)) generateForSchedule(db, schedule, now)
  const upcomingDue = addDays(today, 4)
  const upcoming = db.bills.find((b) => b.userId === userId && b.dueDate === upcomingDue && b.title === 'Electricity'
    && b.scheduleId !== null)
  if (upcoming) {
    upcoming.amountCents = roundCents(9600 * ELECTRICITY_SEASON[monthValue(upcomingDue) - 1])
    await uploadStatement(upcoming, `lumenfield-statement-${upcomingDue}.pdf`,
      statement(upcoming, 'Electricity statement', 'LE-20417-883', upcoming.amountCents, null), addDays(today, -6))
  }
  createReminders(db, userId, now)

  // A couple of older, already-read reminders so the notification centre shows history.
  for (const title of ['Monthly rent', 'Electricity']) {
    const [bill] = last(history.get(title)!, 1)
    const created = zonedInstant(addDays(bill.dueDate, -bill.reminderLeadDays), 7, 0, ZONE)
    const read = new Date(created.getTime() + 3 * 3_600_000)
    const providerName = db.providers.find((p) => p.id === bill.providerId)!.name
    insertNotification(db, bill, 'BILL_DUE_SOON', `${providerName} bill due in ${bill.reminderLeadDays} days`,
      `${displayMoney(bill.amountCents, 'EUR')} for ${bill.title} is due ${formatReminderDate(bill.dueDate)}.`,
      created.toISOString(), read.toISOString())
  }
  return userId
}
