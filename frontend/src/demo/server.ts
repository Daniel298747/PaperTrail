// The PaperTrail REST API, implemented in the browser for the static GitHub Pages demo.
//
// The SPA's HTTP client hands every request here instead of to fetch() when the app is built with
// VITE_DEMO_MODE=true. Each handler follows its Spring controller and service: the same validation messages,
// error codes, status derivation, recurring bill generation, reminders and analytics definitions. Requests run
// against a copy of the database that is saved only when the handler succeeds, like a transaction.

import type { AuthResponse, Frequency as FrequencyValue } from '../api/types'
import { addDays, endOfMonth, isValidTimezone, later, monthsBetween, yearMonthOf, ymAdd } from './dates'
import { cleanFilename, detectType, receiptImage, statementPdf } from './documents'
import {
  accountResponse,
  billDetail,
  billSummary,
  categoryRef,
  documentResponse,
  documentsOf,
  generateForSchedule,
  householdToday,
  newBill,
  nextOccurrences,
  notificationResponse,
  providerRef,
  requireRow,
  runJobs,
  scheduleResponse,
} from './domain'
import {
  amountCents,
  badRequest,
  compareValues,
  conflict,
  invalidField,
  invalidParameter,
  json,
  noContent,
  notFound,
  paginate,
  parseSort,
  Problem,
  Query,
  read,
  readJson,
  thenBy,
  unauthorized,
  Violations,
  type Body,
} from './http'
import { hashPassword, seedDemoHousehold, starterCategories } from './seed'
import {
  deleteFiles,
  emptyDb,
  getFile,
  loadDb,
  putFile,
  saveDb,
  type BillRow,
  type Db,
  type DocumentRow,
  type ScheduleRow,
  type UserRow,
} from './store'
import { formatCents, isValidCurrency, sha256Hex, UUID_PATTERN, uuid } from './util'

/** A short pause so loading states behave as they do against a real server. */
const LATENCY_MS = 120
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ACCESS_TOKEN_TTL_MS = 15 * 60_000
const LINK_TTL_MS = 5 * 60_000
const FREQUENCIES: readonly FrequencyValue[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL']

interface Context {
  db: Db
  now: Date
  params: Record<string, string>
  query: Query
  init: RequestInit
  /** Set on authenticated routes. */
  user: UserRow
  /** The household's calendar date (authenticated routes). */
  today: string
}

type Handler = (ctx: Context) => Response | Promise<Response>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  authenticated: boolean
  handler: Handler
}

const routes: Route[] = []

function route(method: string, path: string, handler: Handler, authenticated = true) {
  const keys: string[] = []
  const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, key: string) => {
    keys.push(key)
    return '([^/]+)'
  })}$`)
  routes.push({ method, pattern, keys, authenticated, handler })
}

/** Access tokens live in memory, like the 15-minute JWT the SPA keeps only in memory. */
const accessTokens = new Map<string, string>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let seeding: Promise<void> | null = null

async function ensureSeeded() {
  if (loadDb()) return
  seeding ??= (async () => {
    const db = emptyDb()
    await seedDemoHousehold(db)
    if (!loadDb()) saveDb(db)
  })().finally(() => {
    seeding = null
  })
  await seeding
}

export async function handle(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, 'https://papertrail.demo')
  await sleep(LATENCY_MS)
  try {
    await ensureSeeded()
    const stored = loadDb() ?? emptyDb()
    const before = JSON.stringify(stored)
    const db = structuredClone(stored)
    const response = await dispatch(db, (init.method ?? 'GET').toUpperCase(), url, init)
    if (JSON.stringify(db) !== before) saveDb(db)
    return response
  } catch (error) {
    if (error instanceof Problem) return error.toResponse(url.pathname)
    console.error('[PaperTrail demo API]', error)
    return new Problem(500, 'internal_error', 'Something went wrong on our side.').toResponse(url.pathname)
  }
}

async function dispatch(db: Db, method: string, url: URL, init: RequestInit): Promise<Response> {
  for (const candidate of routes) {
    if (candidate.method !== method) continue
    const match = candidate.pattern.exec(url.pathname)
    if (!match) continue
    const params: Record<string, string> = {}
    candidate.keys.forEach((key, i) => {
      const value = decodeURIComponent(match[i + 1])
      if (!UUID_PATTERN.test(value)) throw invalidParameter(key)
      params[key] = value.toLowerCase()
    })
    const now = new Date()
    const ctx = { db, now, params, query: new Query(url.searchParams), init } as Context
    if (candidate.authenticated) {
      ctx.user = authenticate(db, init)
      ctx.today = householdToday(ctx.user, now)
      // The backend's scheduled job runs every 15 minutes; here it runs (idempotently) on each request.
      runJobs(db, ctx.user.id, now)
    }
    return candidate.handler(ctx)
  }
  throw new Problem(404, 'not_found', 'No endpoint matches this address.')
}

function authenticate(db: Db, init: RequestInit): UserRow {
  const header = new Headers(init.headers).get('Authorization') ?? ''
  const userId = header.startsWith('Bearer ') ? accessTokens.get(header.slice(7)) : undefined
  if (!userId) throw unauthorized('unauthenticated', 'Sign in to continue.')
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw unauthorized('account_missing', 'This account no longer exists.')
  return user
}

function openSession(db: Db, user: UserRow, now: Date): AuthResponse {
  db.sessionUserId = user.id
  const token = `demo.${uuid()}`
  accessTokens.set(token, user.id)
  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS).toISOString(),
    account: accountResponse(db, user, now),
  }
}

const touch = (row: { updatedAt: string; version: number }, now: Date) => {
  row.updatedAt = now.toISOString()
  row.version++
}

// ---------------------------------------------------------------------------------------------------------
// Auth (AuthController, AuthService, PasswordPolicy)

function checkPassword(password: string, field: string) {
  if (password.length < 8) throw invalidField(field, 'Use at least 8 characters.')
  if (new TextEncoder().encode(password).length > 72) {
    throw invalidField(field, 'That password is too long. Use at most 72 bytes.')
  }
  if (password.trim() === '') throw invalidField(field, "A password can't be only spaces.")
}

const normaliseEmail = (email: string | null) => (email ?? '').trim().toLowerCase()

route('GET', '/api/auth/csrf', () => json({ headerName: 'X-XSRF-TOKEN', token: 'demo-csrf-token' }), false)

route('POST', '/api/auth/register', async ({ db, init, now }) => {
  const body = readJson(init)
  const email = read.string(body, 'email')
  const password = read.string(body, 'password')
  const displayName = read.string(body, 'displayName')
  const timezone = read.string(body, 'timezone')
  const currency = read.string(body, 'currency')
  const v = new Violations()
  if (!email?.trim()) v.add('email', 'Enter your email address.')
  else if (!/^[^@\s]+@[^@\s]+$/.test(email.trim())) v.add('email', 'Enter a valid email address.')
  if (email && email.length > 254) v.add('email', 'Email is too long.')
  if (!password?.trim()) v.add('password', 'Choose a password.')
  if (password !== null && (password.length < 8 || password.length > 72)) {
    v.add('password', 'Use between 8 and 72 characters.')
  }
  if (!displayName?.trim()) v.add('displayName', 'Enter a household or display name.')
  if (displayName && displayName.length > 80) v.add('displayName', 'Use at most 80 characters.')
  if (timezone && timezone.length > 64) v.add('timezone', 'size must be between 0 and 64')
  if (currency && currency.length > 3) v.add('currency', 'size must be between 0 and 3')
  v.throwIfAny()

  const normalised = normaliseEmail(email)
  checkPassword(password!, 'password')
  let zone = 'UTC'
  if (timezone?.trim()) {
    if (!isValidTimezone(timezone.trim())) {
      throw invalidField('timezone', 'Choose a timezone from the list, for example Europe/Dublin.')
    }
    zone = timezone.trim()
  }
  const code = currency?.trim() ? currency.trim().toUpperCase() : 'EUR'
  if (!isValidCurrency(code)) throw invalidField('currency', 'Use a valid ISO 4217 currency code, such as EUR.')
  if (db.users.some((u) => u.email === normalised)) {
    throw conflict('email_taken', 'An account with this email already exists.')
  }
  const passwordSalt = uuid()
  const user: UserRow = {
    id: uuid(),
    email: normalised,
    passwordSalt,
    passwordHash: await hashPassword(password!, passwordSalt),
    displayName: displayName!.trim(),
    currency: code,
    timezone: zone,
    defaultReminderLeadDays: 3,
    createdAt: now.toISOString(),
  }
  db.users.push(user)
  starterCategories(db, user.id)
  return json(openSession(db, user, now), 201)
}, false)

route('POST', '/api/auth/login', async ({ db, init, now }) => {
  const body = readJson(init)
  const email = read.string(body, 'email')
  const password = read.string(body, 'password')
  const v = new Violations()
  if (!email?.trim()) v.add('email', 'Enter your email address.')
  if (!password?.trim()) v.add('password', 'Enter your password.')
  v.throwIfAny()
  const user = db.users.find((u) => u.email === normaliseEmail(email))
  if (!user || (await hashPassword(password!, user.passwordSalt)) !== user.passwordHash) {
    throw unauthorized('invalid_credentials', "That email and password don't match an account.")
  }
  return json(openSession(db, user, now))
}, false)

/** With no session there is nothing to resume (204); a session whose household is gone is a 401. */
route('POST', '/api/auth/refresh', ({ db, now }) => {
  if (!db.sessionUserId) return noContent()
  const user = db.users.find((u) => u.id === db.sessionUserId)
  if (!user) {
    db.sessionUserId = null
    return unauthorized('session_invalid', 'Sign in to continue.').toResponse('/api/auth/refresh')
  }
  return json(openSession(db, user, now))
}, false)

route('POST', '/api/auth/logout', ({ db }) => {
  db.sessionUserId = null
  accessTokens.clear()
  return noContent()
}, false)

// ---------------------------------------------------------------------------------------------------------
// Account (AccountController, AccountService)

route('GET', '/api/account', ({ db, user, now }) => json(accountResponse(db, user, now)))

route('PATCH', '/api/account', ({ db, user, init, now }) => {
  const body = readJson(init)
  const displayName = read.string(body, 'displayName')
  const timezone = read.string(body, 'timezone')
  const currency = read.string(body, 'currency')
  const leadDays = read.int(body, 'defaultReminderLeadDays')
  const v = new Violations()
  if (displayName !== null && (displayName.length < 1 || displayName.length > 80)) {
    v.add('displayName', 'Use between 1 and 80 characters.')
  }
  if (timezone !== null && timezone.length > 64) v.add('timezone', 'size must be between 0 and 64')
  if (currency !== null && currency.length !== 3) v.add('currency', 'Use a three-letter currency code.')
  if (leadDays !== null && (leadDays < 0 || leadDays > 60)) v.add('defaultReminderLeadDays', 'Use 0 to 60 days.')
  v.throwIfAny()

  if (displayName !== null) {
    if (displayName.trim() === '') throw invalidField('displayName', 'Enter a name.')
    user.displayName = displayName.trim()
  }
  if (timezone !== null) {
    if (!isValidTimezone(timezone.trim())) {
      throw invalidField('timezone', 'Choose a timezone from the list, for example Europe/Dublin.')
    }
    user.timezone = timezone.trim()
  }
  if (currency !== null) {
    const code = currency.trim().toUpperCase()
    if (!isValidCurrency(code)) throw invalidField('currency', 'Use a valid ISO 4217 currency code, such as EUR.')
    if (code !== user.currency) {
      if (db.bills.some((b) => b.userId === user.id) || db.schedules.some((s) => s.userId === user.id)) {
        throw conflict('currency_locked',
          "The currency can't change once bills or schedules exist, so totals never mix currencies.")
      }
      user.currency = code
    }
  }
  if (leadDays !== null) user.defaultReminderLeadDays = leadDays
  return json(accountResponse(db, user, now))
})

route('POST', '/api/account/password', async ({ user, init }) => {
  const body = readJson(init)
  const currentPassword = read.string(body, 'currentPassword')
  const newPassword = read.string(body, 'newPassword')
  const v = new Violations()
  if (!currentPassword?.trim()) v.add('currentPassword', 'Enter your current password.')
  if (!newPassword?.trim()) v.add('newPassword', 'Choose a new password.')
  if (newPassword !== null && (newPassword.length < 8 || newPassword.length > 72)) {
    v.add('newPassword', 'Use between 8 and 72 characters.')
  }
  v.throwIfAny()
  if ((await hashPassword(currentPassword!, user.passwordSalt)) !== user.passwordHash) {
    throw invalidField('currentPassword', "That isn't your current password.")
  }
  checkPassword(newPassword!, 'newPassword')
  user.passwordSalt = uuid()
  user.passwordHash = await hashPassword(newPassword!, user.passwordSalt)
  return noContent()
})

// ---------------------------------------------------------------------------------------------------------
// Bills (BillController, BillService, BillSpecifications)

const STATUS_FILTERS = ['outstanding', 'unpaid', 'overdue', 'paid'] as const

route('GET', '/api/bills', ({ db, user, query, today }) => {
  const sort = parseSort<BillRow>(query.string('sort'), {
    dueDate: (b) => b.dueDate,
    amount: (b) => b.amountCents,
    title: (b) => b.title,
    provider: (b) => providerRef(db, b.providerId).name,
    category: (b) => categoryRef(db, b.categoryId).name,
    status: (b) => b.status,
    paidDate: (b) => b.paidDate,
    createdAt: (b) => b.createdAt,
  }, 'dueDate,asc')
  const rawStatus = query.string('status')?.trim().toLowerCase() ?? null
  if (rawStatus !== null && rawStatus !== 'all' && rawStatus !== ''
    && !(STATUS_FILTERS as readonly string[]).includes(rawStatus)) {
    throw badRequest('invalid_status', 'Status must be one of outstanding, unpaid, overdue, paid or all.')
  }
  const status = rawStatus === 'all' || rawStatus === '' ? null : rawStatus
  const text = query.string('q')?.trim().toLowerCase() ?? ''
  const providerId = query.uuid('providerId')
  const categoryId = query.uuid('categoryId')
  const scheduleId = query.uuid('scheduleId')
  const dueFrom = query.date('dueFrom')
  const dueTo = query.date('dueTo')
  const page = query.int('page', 0)
  const size = query.int('size', 20)

  const matches = db.bills.filter((b) => {
    if (b.userId !== user.id) return false
    if (text) {
      const haystack = [b.title, providerRef(db, b.providerId).name, categoryRef(db, b.categoryId).name, b.notes ?? '']
      if (!haystack.some((value) => value.toLowerCase().includes(text))) return false
    }
    if (status === 'outstanding' && b.status !== 'UNPAID') return false
    if (status === 'unpaid' && !(b.status === 'UNPAID' && b.dueDate >= today)) return false
    if (status === 'overdue' && !(b.status === 'UNPAID' && b.dueDate < today)) return false
    if (status === 'paid' && b.status !== 'PAID') return false
    if (providerId && b.providerId !== providerId) return false
    if (categoryId && b.categoryId !== categoryId) return false
    if (scheduleId && b.scheduleId !== scheduleId) return false
    if (dueFrom && b.dueDate < dueFrom) return false
    if (dueTo && b.dueDate > dueTo) return false
    return true
  })
  matches.sort(thenBy(sort, (a, b) => -compareValues(a.createdAt, b.createdAt)))
  const result = paginate(matches, page, size)
  return json({ ...result, content: result.content.map((b) => billSummary(db, b, today)) })
})

interface BillFields {
  title: string
  providerId: string
  categoryId: string
  amountCents: number
  dueDate: string
  reminderLeadDays: number | null
  notes: string | null
  version: number | null
}

function readBill(body: Body): BillFields {
  const title = read.string(body, 'title')
  const providerId = read.uuid(body, 'providerId')
  const categoryId = read.uuid(body, 'categoryId')
  const amount = read.decimal(body, 'amount')
  const dueDate = read.date(body, 'dueDate')
  const reminderLeadDays = read.int(body, 'reminderLeadDays')
  const notes = read.string(body, 'notes')
  const version = read.int(body, 'version')
  const v = new Violations()
  if (!title?.trim()) v.add('title', 'Enter a title.')
  if (title && title.length > 160) v.add('title', 'Use at most 160 characters.')
  if (!providerId) v.add('providerId', 'Choose a provider.')
  if (!categoryId) v.add('categoryId', 'Choose a category.')
  const cents = amountCents(v, 'amount', amount, 'Enter an amount.')
  if (!dueDate) v.add('dueDate', 'Choose a due date.')
  if (reminderLeadDays !== null && (reminderLeadDays < 0 || reminderLeadDays > 60)) {
    v.add('reminderLeadDays', 'Use 0 to 60 days.')
  }
  if (notes && notes.length > 2000) v.add('notes', 'Notes can be at most 2000 characters.')
  v.throwIfAny()
  return {
    title: title!.trim(),
    providerId: providerId!,
    categoryId: categoryId!,
    amountCents: cents!,
    dueDate: dueDate!,
    reminderLeadDays,
    notes: notes?.trim() ? notes.trim() : null,
    version,
  }
}

/** Provider and category must belong to the household. */
function checkReferences(db: Db, userId: string, providerId: string, categoryId: string) {
  if (!db.providers.some((p) => p.id === providerId && p.userId === userId)) {
    throw invalidField('providerId', 'Choose one of your providers.')
  }
  if (!db.categories.some((c) => c.id === categoryId && c.userId === userId)) {
    throw invalidField('categoryId', 'Choose one of your categories.')
  }
}

const requireBill = (db: Db, userId: string, id: string) => requireRow(db.bills, id, userId, () => notFound('Bill'))

route('GET', '/api/bills/:id', ({ db, user, params, today }) =>
  json(billDetail(db, requireBill(db, user.id, params.id), today)))

route('POST', '/api/bills', ({ db, user, init, now, today }) => {
  const fields = readBill(readJson(init))
  checkReferences(db, user.id, fields.providerId, fields.categoryId)
  const bill = newBill({
    userId: user.id,
    title: fields.title,
    providerId: fields.providerId,
    categoryId: fields.categoryId,
    amountCents: fields.amountCents,
    currency: user.currency,
    dueDate: fields.dueDate,
    reminderLeadDays: fields.reminderLeadDays ?? user.defaultReminderLeadDays,
    notes: fields.notes,
    scheduleId: null,
  }, now)
  db.bills.push(bill)
  return json(billDetail(db, bill, today), 201)
})

route('PUT', '/api/bills/:id', ({ db, user, init, params, now, today }) => {
  const fields = readBill(readJson(init))
  const bill = requireBill(db, user.id, params.id)
  if (fields.version !== null && fields.version !== bill.version) {
    throw conflict('stale_update', 'This bill was changed elsewhere. Reload it and try again.')
  }
  checkReferences(db, user.id, fields.providerId, fields.categoryId)
  Object.assign(bill, {
    title: fields.title,
    providerId: fields.providerId,
    categoryId: fields.categoryId,
    amountCents: fields.amountCents,
    dueDate: fields.dueDate,
    reminderLeadDays: fields.reminderLeadDays ?? bill.reminderLeadDays,
    notes: fields.notes,
  })
  touch(bill, now)
  return json(billDetail(db, bill, today))
})

/** Deletes the bill with its statement versions and reminders; stored files go with it. */
route('DELETE', '/api/bills/:id', async ({ db, user, params }) => {
  const bill = requireBill(db, user.id, params.id)
  const uploads = db.documents.filter((d) => d.billId === bill.id && d.source.kind === 'upload').map((d) => d.id)
  db.documents = db.documents.filter((d) => d.billId !== bill.id)
  db.notifications = db.notifications.filter((n) => n.billId !== bill.id)
  for (const entry of db.occurrences) if (entry.billId === bill.id) entry.billId = null
  db.bills = db.bills.filter((b) => b.id !== bill.id)
  await deleteFiles(uploads)
  return noContent()
})

/** Mark paid. The payment date defaults to today in the household timezone. */
route('POST', '/api/bills/:id/payment', ({ db, user, init, params, now, today }) => {
  const paidDate = read.date(readJson(init, false), 'paidDate')
  const bill = requireBill(db, user.id, params.id)
  const paidOn = paidDate ?? today
  if (paidOn > today) throw invalidField('paidDate', "The payment date can't be in the future.")
  bill.status = 'PAID'
  bill.paidDate = paidOn
  touch(bill, now)
  return json(billDetail(db, bill, today))
})

route('DELETE', '/api/bills/:id/payment', ({ db, user, params, now, today }) => {
  const bill = requireBill(db, user.id, params.id)
  bill.status = 'UNPAID'
  bill.paidDate = null
  touch(bill, now)
  return json(billDetail(db, bill, today))
})

// ---------------------------------------------------------------------------------------------------------
// Statements (DocumentController, DocumentService)

route('GET', '/api/bills/:billId/documents', ({ db, user, params }) => {
  requireBill(db, user.id, params.billId)
  return json(documentsOf(db, params.billId).map((d, i) => documentResponse(d, i === 0)))
})

/** Each upload becomes the bill's next version; earlier versions stay retrievable. */
route('POST', '/api/bills/:billId/documents', async ({ db, user, init, params, now }) => {
  const form = init.body instanceof FormData ? init.body : null
  const file = form?.get('file')
  if (!(file instanceof Blob)) throw badRequest('file_missing', 'Choose a statement file to upload.')
  const tooLarge = () => new Problem(413, 'file_too_large', 'Statements can be at most 10 MB.')
  if (file.size > MAX_UPLOAD_BYTES) throw tooLarge()
  requireBill(db, user.id, params.billId)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) throw badRequest('file_empty', 'That file is empty. Choose a PDF, JPG or PNG statement.')
  const type = detectType(bytes)
  if (!type) throw new Problem(415, 'unsupported_file_type', 'Upload a PDF, JPG or PNG statement.')
  const id = uuid()
  const versionNumber = Math.max(0, ...db.documents.filter((d) => d.billId === params.billId)
    .map((d) => d.versionNumber)) + 1
  const document: DocumentRow = {
    id,
    userId: user.id,
    billId: params.billId,
    versionNumber,
    filename: cleanFilename(file instanceof File ? file.name : '', type.extension),
    contentType: type.mimeType,
    sizeBytes: bytes.length,
    sha256: await sha256Hex(bytes),
    uploadedAt: now.toISOString(),
    source: { kind: 'upload' },
  }
  await putFile(id, new Blob([bytes], { type: type.mimeType }))
  db.documents.push(document)
  return json(documentResponse(document, true), 201)
})

route('GET', '/api/documents', ({ db, user, query }) => {
  const sort = parseSort<DocumentRow>(query.string('sort'), {
    uploadedAt: (d) => d.uploadedAt,
    filename: (d) => d.filename,
    bill: (d) => db.bills.find((b) => b.id === d.billId)?.title ?? '',
    provider: (d) => providerRef(db, db.bills.find((b) => b.id === d.billId)?.providerId ?? '').name,
    size: (d) => d.sizeBytes,
  }, 'uploadedAt,desc')
  const text = query.string('q')?.trim().toLowerCase() ?? ''
  const providerId = query.uuid('providerId')
  const latestOnly = query.bool('latestOnly', false)
  const page = query.int('page', 0)
  const size = query.int('size', 20)
  const latestVersion = new Map<string, { count: number; max: number }>()
  for (const d of db.documents) {
    const stats = latestVersion.get(d.billId) ?? { count: 0, max: 0 }
    latestVersion.set(d.billId, { count: stats.count + 1, max: Math.max(stats.max, d.versionNumber) })
  }
  const matches = db.documents.filter((d) => {
    if (d.userId !== user.id) return false
    const bill = db.bills.find((b) => b.id === d.billId)
    if (!bill) return false
    if (text && ![d.filename, bill.title, providerRef(db, bill.providerId).name]
      .some((value) => value.toLowerCase().includes(text))) return false
    if (providerId && bill.providerId !== providerId) return false
    if (latestOnly && d.versionNumber !== latestVersion.get(d.billId)?.max) return false
    return true
  })
  matches.sort(thenBy(sort, (a, b) => b.versionNumber - a.versionNumber))
  const result = paginate(matches, page, size)
  return json({
    ...result,
    content: result.content.map((d) => {
      const bill = db.bills.find((b) => b.id === d.billId)!
      const stats = latestVersion.get(d.billId)!
      return {
        id: d.id,
        billId: bill.id,
        billTitle: bill.title,
        billDueDate: bill.dueDate,
        provider: providerRef(db, bill.providerId),
        category: categoryRef(db, bill.categoryId),
        versionNumber: d.versionNumber,
        versionCount: stats.count,
        latest: d.versionNumber === stats.max,
        filename: d.filename,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt,
      }
    }),
  })
})

async function documentBytes(document: DocumentRow): Promise<Blob> {
  switch (document.source.kind) {
    case 'statement':
      return new Blob([statementPdf(document.source.statement) as Uint8Array<ArrayBuffer>],
        { type: document.contentType })
    case 'receipt':
      return new Blob([await receiptImage(document.source.receipt) as Uint8Array<ArrayBuffer>],
        { type: document.contentType })
    case 'upload': {
      const stored = await getFile(document.id)
      if (!stored) {
        throw new Problem(502, 'storage_unavailable',
          'This file is no longer stored in this browser. Upload it again to keep a copy.')
      }
      return stored
    }
  }
}

/** Stands in for a signed S3 URL: a short-lived object URL for the file's bytes. */
route('GET', '/api/documents/:id/link', async ({ db, user, params, query, now }) => {
  const download = query.bool('download', false)
  const document = requireRow(db.documents, params.id, user.id, () => notFound('Document'))
  const url = URL.createObjectURL(await documentBytes(document))
  setTimeout(() => URL.revokeObjectURL(url), LINK_TTL_MS)
  return json({
    url,
    expiresAt: new Date(now.getTime() + LINK_TTL_MS).toISOString(),
    filename: document.filename,
    contentType: document.contentType,
    disposition: download ? 'attachment' : 'inline',
  })
})

// ---------------------------------------------------------------------------------------------------------
// Providers and categories (ProviderService, CategoryService)

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

function usage(db: Db, userId: string, key: 'providerId' | 'categoryId', id: string) {
  return {
    billCount: db.bills.filter((b) => b.userId === userId && b[key] === id).length,
    scheduleCount: db.schedules.filter((s) => s.userId === userId && s[key] === id).length,
  }
}

function providerResponse(db: Db, userId: string, provider: Db['providers'][number]) {
  return {
    id: provider.id,
    name: provider.name,
    defaultCategory: provider.defaultCategoryId ? categoryRef(db, provider.defaultCategoryId) : null,
    ...usage(db, userId, 'providerId', provider.id),
  }
}

function readName(body: Body, emptyMessage: string, max: number): string {
  const name = read.string(body, 'name')
  const v = new Violations()
  if (!name?.trim()) v.add('name', emptyMessage)
  if (name && name.length > max) v.add('name', `Use at most ${max} characters.`)
  v.throwIfAny()
  return name!.trim()
}

function defaultCategory(db: Db, userId: string, body: Body): string | null {
  const id = read.uuid(body, 'defaultCategoryId')
  if (id === null) return null
  if (!db.categories.some((c) => c.id === id && c.userId === userId)) {
    throw invalidField('defaultCategoryId', 'Choose one of your categories.')
  }
  return id
}

route('GET', '/api/providers', ({ db, user }) =>
  json(db.providers.filter((p) => p.userId === user.id).sort(byName).map((p) => providerResponse(db, user.id, p))))

route('POST', '/api/providers', ({ db, user, init }) => {
  const body = readJson(init)
  const name = readName(body, 'Enter a provider name.', 120)
  if (db.providers.some((p) => p.userId === user.id && p.name.toLowerCase() === name.toLowerCase())) {
    throw conflict('provider_exists', `You already have a provider called "${name}".`)
  }
  const provider = { id: uuid(), userId: user.id, name, defaultCategoryId: defaultCategory(db, user.id, body) }
  db.providers.push(provider)
  return json(providerResponse(db, user.id, provider), 201)
})

route('PUT', '/api/providers/:id', ({ db, user, init, params }) => {
  const body = readJson(init)
  const name = readName(body, 'Enter a provider name.', 120)
  const provider = requireRow(db.providers, params.id, user.id, () => notFound('Provider'))
  if (db.providers.some((p) => p.userId === user.id && p.id !== provider.id
    && p.name.toLowerCase() === name.toLowerCase())) {
    throw conflict('provider_exists', `You already have a provider called "${name}".`)
  }
  provider.defaultCategoryId = defaultCategory(db, user.id, body)
  provider.name = name
  return json(providerResponse(db, user.id, provider))
})

/** Refused while in use unless the caller names a provider to move the bills and schedules to. */
route('DELETE', '/api/providers/:id', ({ db, user, params, query, now }) => {
  const provider = requireRow(db.providers, params.id, user.id, () => notFound('Provider'))
  const reassignTo = query.uuid('reassignTo')
  const counts = usage(db, user.id, 'providerId', provider.id)
  if (counts.billCount > 0 || counts.scheduleCount > 0) {
    if (reassignTo === null) {
      throw conflict('provider_in_use',
        `"${provider.name}" is still used. Choose another provider to move its bills to.`, counts)
    }
    if (reassignTo === provider.id) {
      throw badRequest('invalid_reassignment', 'Choose a different provider to move bills to.')
    }
    if (!db.providers.some((p) => p.id === reassignTo && p.userId === user.id)) {
      throw badRequest('invalid_reassignment', "The provider to move bills to wasn't found.")
    }
    for (const row of [...db.bills, ...db.schedules]) {
      if (row.userId === user.id && row.providerId === provider.id) {
        row.providerId = reassignTo
        row.updatedAt = now.toISOString()
      }
    }
  }
  db.providers = db.providers.filter((p) => p.id !== provider.id)
  return noContent()
})

function categoryResponse(db: Db, userId: string, category: Db['categories'][number]) {
  return { id: category.id, name: category.name, ...usage(db, userId, 'categoryId', category.id) }
}

route('GET', '/api/categories', ({ db, user }) =>
  json(db.categories.filter((c) => c.userId === user.id).sort(byName).map((c) => categoryResponse(db, user.id, c))))

route('POST', '/api/categories', ({ db, user, init }) => {
  const name = readName(readJson(init), 'Enter a category name.', 60)
  if (db.categories.some((c) => c.userId === user.id && c.name.toLowerCase() === name.toLowerCase())) {
    throw conflict('category_exists', `You already have a category called "${name}".`)
  }
  const category = { id: uuid(), userId: user.id, name }
  db.categories.push(category)
  return json(categoryResponse(db, user.id, category), 201)
})

route('PUT', '/api/categories/:id', ({ db, user, init, params }) => {
  const name = readName(readJson(init), 'Enter a category name.', 60)
  const category = requireRow(db.categories, params.id, user.id, () => notFound('Category'))
  if (db.categories.some((c) => c.userId === user.id && c.id !== category.id
    && c.name.toLowerCase() === name.toLowerCase())) {
    throw conflict('category_exists', `You already have a category called "${name}".`)
  }
  category.name = name
  return json(categoryResponse(db, user.id, category))
})

route('DELETE', '/api/categories/:id', ({ db, user, params, query, now }) => {
  const category = requireRow(db.categories, params.id, user.id, () => notFound('Category'))
  const reassignTo = query.uuid('reassignTo')
  const counts = usage(db, user.id, 'categoryId', category.id)
  if (counts.billCount > 0 || counts.scheduleCount > 0) {
    if (reassignTo === null) {
      throw conflict('category_in_use',
        `"${category.name}" is still used. Choose another category to move its bills to.`, counts)
    }
    if (reassignTo === category.id) {
      throw badRequest('invalid_reassignment', 'Choose a different category to move bills to.')
    }
    if (!db.categories.some((c) => c.id === reassignTo && c.userId === user.id)) {
      throw badRequest('invalid_reassignment', "The category to move bills to wasn't found.")
    }
    for (const row of [...db.bills, ...db.schedules]) {
      if (row.userId === user.id && row.categoryId === category.id) {
        row.categoryId = reassignTo
        row.updatedAt = now.toISOString()
      }
    }
  }
  for (const provider of db.providers) {
    if (provider.userId === user.id && provider.defaultCategoryId === category.id) provider.defaultCategoryId = null
  }
  db.categories = db.categories.filter((c) => c.id !== category.id)
  return noContent()
})

// ---------------------------------------------------------------------------------------------------------
// Recurring schedules (ScheduleController, ScheduleService)

const requireSchedule = (db: Db, userId: string, id: string) =>
  requireRow(db.schedules, id, userId, () => notFound('Schedule'))

function scheduleDetail(db: Db, schedule: ScheduleRow, today: string) {
  const recentBills = db.bills
    .filter((b) => b.scheduleId === schedule.id && b.userId === schedule.userId)
    .sort((a, b) => compareValues(b.dueDate, a.dueDate))
    .slice(0, 12)
  return {
    schedule: scheduleResponse(db, schedule, today),
    recentBills: recentBills.map((b) => billSummary(db, b, today)),
  }
}

interface ScheduleFields {
  title: string
  providerId: string
  categoryId: string
  amountCents: number
  frequency: FrequencyValue
  startDate: string
  billingDay: number
  reminderLeadDays: number
  active: boolean | null
  notes: string | null
  version: number | null
}

function readSchedule(body: Body): ScheduleFields {
  const title = read.string(body, 'title')
  const providerId = read.uuid(body, 'providerId')
  const categoryId = read.uuid(body, 'categoryId')
  const amount = read.decimal(body, 'amount')
  const frequency = read.enumOf(body, 'frequency', FREQUENCIES)
  const startDate = read.date(body, 'startDate')
  const billingDay = read.int(body, 'billingDay')
  const reminderLeadDays = read.int(body, 'reminderLeadDays')
  const active = read.bool(body, 'active')
  const notes = read.string(body, 'notes')
  const version = read.int(body, 'version')
  const v = new Violations()
  if (!title?.trim()) v.add('title', 'Enter a title.')
  if (title && title.length > 160) v.add('title', 'Use at most 160 characters.')
  if (!providerId) v.add('providerId', 'Choose a provider.')
  if (!categoryId) v.add('categoryId', 'Choose a category.')
  const cents = amountCents(v, 'amount', amount, 'Enter the usual amount.')
  if (!frequency) v.add('frequency', 'Choose how often this bill arrives.')
  if (!startDate) v.add('startDate', 'Choose a start date.')
  if (billingDay === null) v.add('billingDay', 'Choose a billing day.')
  else if (billingDay < 1 || billingDay > 31) v.add('billingDay', 'Use a day from 1 to 31.')
  if (reminderLeadDays === null) v.add('reminderLeadDays', 'Choose a reminder lead time.')
  else if (reminderLeadDays < 0 || reminderLeadDays > 60) v.add('reminderLeadDays', 'Use 0 to 60 days.')
  if (notes && notes.length > 2000) v.add('notes', 'Notes can be at most 2000 characters.')
  v.throwIfAny()
  return {
    title: title!.trim(),
    providerId: providerId!,
    categoryId: categoryId!,
    amountCents: cents!,
    frequency: frequency!,
    startDate: startDate!,
    billingDay: billingDay!,
    reminderLeadDays: reminderLeadDays!,
    active,
    notes: notes?.trim() ? notes.trim() : null,
    version,
  }
}

function applySchedule(schedule: ScheduleRow, fields: ScheduleFields) {
  Object.assign(schedule, {
    title: fields.title,
    providerId: fields.providerId,
    categoryId: fields.categoryId,
    amountCents: fields.amountCents,
    frequency: fields.frequency,
    startDate: fields.startDate,
    billingDay: fields.billingDay,
    reminderLeadDays: fields.reminderLeadDays,
    notes: fields.notes,
  })
  if (fields.active !== null) schedule.active = fields.active
}

route('GET', '/api/schedules', ({ db, user, today }) => {
  const schedules = db.schedules.filter((s) => s.userId === user.id)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title))
  return json(schedules.map((s) => scheduleResponse(db, s, today)))
})

route('POST', '/api/schedules/preview', ({ init, today }) => {
  const body = readJson(init)
  const startDate = read.date(body, 'startDate')
  const billingDay = read.int(body, 'billingDay')
  const frequency = read.enumOf(body, 'frequency', FREQUENCIES)
  const count = read.int(body, 'count')
  const v = new Violations()
  if (!startDate) v.add('startDate', 'Choose a start date.')
  if (billingDay === null) v.add('billingDay', 'Choose a billing day.')
  else if (billingDay < 1 || billingDay > 31) v.add('billingDay', 'Use a day from 1 to 31.')
  if (!frequency) v.add('frequency', 'Choose a frequency.')
  if (count !== null && count < 1) v.add('count', 'must be greater than or equal to 1')
  if (count !== null && count > 24) v.add('count', 'must be less than or equal to 24')
  v.throwIfAny()
  const rule = { startDate: startDate!, billingDay: billingDay!, frequency: frequency! }
  return json({ dates: nextOccurrences(rule, later(startDate!, today), count ?? 6) })
})

route('GET', '/api/schedules/:id', ({ db, user, params, today }) =>
  json(scheduleDetail(db, requireSchedule(db, user.id, params.id), today)))

/** Creating an active schedule immediately generates any instances already inside the horizon. */
route('POST', '/api/schedules', ({ db, user, init, now, today }) => {
  const fields = readSchedule(readJson(init))
  checkReferences(db, user.id, fields.providerId, fields.categoryId)
  const stamp = now.toISOString()
  const schedule: ScheduleRow = {
    id: uuid(),
    userId: user.id,
    currency: user.currency,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
    version: 0,
    title: '',
    providerId: '',
    categoryId: '',
    amountCents: 0,
    frequency: 'MONTHLY',
    startDate: '',
    billingDay: 1,
    reminderLeadDays: 0,
    notes: null,
  }
  applySchedule(schedule, fields)
  db.schedules.push(schedule)
  generateForSchedule(db, schedule, now)
  return json(scheduleDetail(db, schedule, today), 201)
})

/** Edits change future generation only; bills already generated stay as they are. */
route('PUT', '/api/schedules/:id', ({ db, user, init, params, now, today }) => {
  const fields = readSchedule(readJson(init))
  const schedule = requireSchedule(db, user.id, params.id)
  if (fields.version !== null && fields.version !== schedule.version) {
    throw conflict('stale_update', 'This schedule was changed elsewhere. Reload it and try again.')
  }
  checkReferences(db, user.id, fields.providerId, fields.categoryId)
  applySchedule(schedule, fields)
  touch(schedule, now)
  generateForSchedule(db, schedule, now)
  return json(scheduleDetail(db, schedule, today))
})

function setActive(ctx: Context, active: boolean): Response {
  const { db, user, params, now, today } = ctx
  const schedule = requireSchedule(db, user.id, params.id)
  if (schedule.active !== active) {
    schedule.active = active
    touch(schedule, now)
  }
  generateForSchedule(db, schedule, now)
  return json(scheduleDetail(db, schedule, today))
}

route('POST', '/api/schedules/:id/pause', (ctx) => setActive(ctx, false))
route('POST', '/api/schedules/:id/resume', (ctx) => setActive(ctx, true))

/** Generated bills are kept (their schedule link is cleared); the generation ledger goes with it. */
route('DELETE', '/api/schedules/:id', ({ db, user, params }) => {
  const schedule = requireSchedule(db, user.id, params.id)
  db.occurrences = db.occurrences.filter((o) => o.scheduleId !== schedule.id)
  for (const bill of db.bills) if (bill.scheduleId === schedule.id) bill.scheduleId = null
  db.schedules = db.schedules.filter((s) => s.id !== schedule.id)
  return noContent()
})

// ---------------------------------------------------------------------------------------------------------
// Notifications (NotificationController, NotificationService)

route('GET', '/api/notifications', ({ db, user, query, today }) => {
  const unreadOnly = query.bool('unreadOnly', false)
  const page = query.int('page', 0)
  const size = query.int('size', 20)
  const matches = db.notifications
    .filter((n) => n.userId === user.id && (!unreadOnly || n.readAt === null))
    .sort((a, b) => compareValues(b.createdAt, a.createdAt) || b.seq - a.seq)
  const result = paginate(matches, page, size)
  return json({ ...result, content: result.content.map((n) => notificationResponse(db, n, today)) })
})

route('GET', '/api/notifications/unread-count', ({ db, user }) =>
  json({ count: db.notifications.filter((n) => n.userId === user.id && n.readAt === null).length }))

route('POST', '/api/notifications/read-all', ({ db, user, now }) => {
  let updated = 0
  for (const n of db.notifications) {
    if (n.userId === user.id && n.readAt === null) {
      n.readAt = now.toISOString()
      updated++
    }
  }
  return json({ updated })
})

route('POST', '/api/notifications/:id/read', ({ db, user, params, now }) => {
  const notification = requireRow(db.notifications, params.id, user.id, () => notFound('Notification'))
  notification.readAt ??= now.toISOString()
  return noContent()
})

// ---------------------------------------------------------------------------------------------------------
// Analytics (AnalyticsService). Billed totals group bills by due date, paid totals by payment date; every
// figure is limited to the household currency so amounts in different currencies are never added.

const MAX_MONTHS = 60

interface Range {
  from: string
  to: string
  start: string
  end: string
}

/** Defaults to the 12 months ending with the current month (household timezone). */
function resolveRange(from: string | null, to: string | null, today: string): Range {
  const end = to ?? yearMonthOf(today)
  const start = from ?? ymAdd(end, -11)
  if (start > end) throw badRequest('invalid_range', 'The start month must be on or before the end month.')
  if (monthsBetween(start, end) >= MAX_MONTHS) {
    throw badRequest('invalid_range', `Choose a range of at most ${MAX_MONTHS} months.`)
  }
  return { from: start, to: end, start: `${start}-01`, end: endOfMonth(end) }
}

function monthsOf(range: Range): string[] {
  const months: string[] = []
  for (let month = range.from; month <= range.to; month = ymAdd(month, 1)) months.push(month)
  return months
}

function analyticsInput({ db, user, query, today }: Context) {
  const from = query.yearMonth('from')
  const to = query.yearMonth('to')
  const providerId = query.uuid('providerId')
  const bills = db.bills.filter((b) => b.userId === user.id && b.currency === user.currency
    && (providerId === null || b.providerId === providerId))
  return { from, to, providerId, bills, today }
}

const figure = (bills: BillRow[]) => ({
  total: formatCents(bills.reduce((sum, b) => sum + b.amountCents, 0)),
  count: bills.length,
})

const within = (date: string | null, range: Range) => date !== null && date >= range.start && date <= range.end

route('GET', '/api/analytics/summary', (ctx) => {
  const { from, to, providerId, bills, today } = analyticsInput(ctx)
  const rangeApplied = from !== null || to !== null
  const range = rangeApplied ? resolveRange(from, to, today)
    : resolveRange(yearMonthOf(today), yearMonthOf(today), today)
  const inRange = (b: BillRow) => !rangeApplied || within(b.dueDate, range)
  const unpaid = bills.filter((b) => b.status === 'UNPAID' && inRange(b))
  const weekEnd = addDays(today, 6)
  return json({
    currency: ctx.user.currency,
    today,
    from: range.from,
    to: range.to,
    rangeApplied,
    providerId,
    outstanding: figure(unpaid),
    overdue: figure(unpaid.filter((b) => b.dueDate < today)),
    dueNext7Days: figure(unpaid.filter((b) => b.dueDate >= today && b.dueDate <= weekEnd)),
    billed: figure(bills.filter((b) => within(b.dueDate, range))),
    paid: figure(bills.filter((b) => b.status === 'PAID' && within(b.paidDate, range))),
  })
})

route('GET', '/api/analytics/monthly', (ctx) => {
  const { from, to, providerId, bills, today } = analyticsInput(ctx)
  const range = resolveRange(from, to, today)
  let billedTotal = 0
  let paidTotal = 0
  const months = monthsOf(range).map((month) => {
    const billed = bills.filter((b) => yearMonthOf(b.dueDate) === month)
    const paid = bills.filter((b) => b.status === 'PAID' && b.paidDate !== null && yearMonthOf(b.paidDate) === month)
    const billedCents = billed.reduce((sum, b) => sum + b.amountCents, 0)
    const paidCents = paid.reduce((sum, b) => sum + b.amountCents, 0)
    billedTotal += billedCents
    paidTotal += paidCents
    return {
      month,
      billed: formatCents(billedCents),
      billedCount: billed.length,
      paid: formatCents(paidCents),
      paidCount: paid.length,
    }
  })
  return json({
    currency: ctx.user.currency,
    from: range.from,
    to: range.to,
    providerId,
    months,
    billedTotal: formatCents(billedTotal),
    paidTotal: formatCents(paidTotal),
  })
})

route('GET', '/api/analytics/categories', (ctx) => {
  const { from, to, providerId, bills, today } = analyticsInput(ctx)
  const range = resolveRange(from, to, today)
  const groups = new Map<string, { total: number; count: number }>()
  for (const bill of bills) {
    if (!within(bill.dueDate, range)) continue
    const group = groups.get(bill.categoryId) ?? { total: 0, count: 0 }
    groups.set(bill.categoryId, { total: group.total + bill.amountCents, count: group.count + 1 })
  }
  const rows = [...groups].map(([categoryId, group]) => ({ categoryId, name: categoryRef(ctx.db, categoryId).name,
    ...group }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const grand = rows.reduce((sum, row) => sum + row.total, 0)
  return json({
    currency: ctx.user.currency,
    from: range.from,
    to: range.to,
    providerId,
    total: formatCents(grand),
    categories: rows.map((row) => {
      // Percentage with one decimal place, rounded half up.
      const tenths = grand === 0 ? 0 : Math.floor((row.total * 2000 + grand) / (2 * grand))
      return {
        categoryId: row.categoryId,
        name: row.name,
        total: formatCents(row.total),
        billCount: row.count,
        sharePercent: grand === 0 ? '0' : `${Math.floor(tenths / 10)}.${tenths % 10}`,
      }
    }),
  })
})

route('GET', '/api/analytics/providers', (ctx) => {
  const { from, to, bills, today } = analyticsInput(ctx)
  const range = resolveRange(from, to, today)
  const months = monthsOf(range)
  const series = new Map<string, { name: string; values: Map<string, number>; count: number }>()
  for (const bill of bills) {
    if (!within(bill.dueDate, range)) continue
    const entry = series.get(bill.providerId)
      ?? { name: providerRef(ctx.db, bill.providerId).name, values: new Map<string, number>(), count: 0 }
    const month = yearMonthOf(bill.dueDate)
    entry.values.set(month, (entry.values.get(month) ?? 0) + bill.amountCents)
    entry.count++
    series.set(bill.providerId, entry)
  }
  const providers = [...series]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([providerId, entry]) => {
      const total = [...entry.values.values()].reduce((sum, value) => sum + value, 0)
      return {
        providerId,
        name: entry.name,
        totalCents: total,
        total: formatCents(total),
        averagePerMonth: formatCents(Math.floor((2 * total + months.length) / (2 * months.length))),
        billCount: entry.count,
        values: months.map((month) => formatCents(entry.values.get(month) ?? 0)),
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
    .map(({ totalCents: _totalCents, ...rest }) => rest)
  return json({ currency: ctx.user.currency, from: range.from, to: range.to, months, providers })
})

