// Persistence for the demo API. The "database" is one JSON document in localStorage (the tables of the
// Flyway schema, minus what only a server needs); uploaded statement files live in IndexedDB. Both stay in
// this browser only. Everything falls back to memory when storage is unavailable (e.g. blocked site data).

export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'
export type PaymentStatus = 'PAID' | 'UNPAID'
export type NotificationType = 'BILL_DUE_SOON' | 'BILL_OVERDUE'

export interface UserRow {
  id: string
  email: string
  passwordSalt: string
  passwordHash: string
  displayName: string
  currency: string
  timezone: string
  defaultReminderLeadDays: number
  createdAt: string
}

export interface CategoryRow {
  id: string
  userId: string
  name: string
}

export interface ProviderRow {
  id: string
  userId: string
  name: string
  defaultCategoryId: string | null
}

export interface ScheduleRow {
  id: string
  userId: string
  title: string
  providerId: string
  categoryId: string
  amountCents: number
  currency: string
  frequency: Frequency
  startDate: string
  billingDay: number
  reminderLeadDays: number
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
  version: number
}

/** The generation ledger: one row per (schedule, cycle month) makes generation idempotent. */
export interface OccurrenceRow {
  scheduleId: string
  cycleMonth: string
  occurrenceDate: string
  billId: string | null
}

export interface BillRow {
  id: string
  userId: string
  title: string
  providerId: string
  categoryId: string
  amountCents: number
  currency: string
  dueDate: string
  status: PaymentStatus
  paidDate: string | null
  reminderLeadDays: number
  notes: string | null
  scheduleId: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface StatementLine {
  label: string
  cents: number
}

export interface StatementSpec {
  provider: string
  documentTitle: string
  accountReference: string
  householdName: string
  issued: string
  periodStart: string
  periodEnd: string
  dueDate: string
  totalCents: number
  lines: StatementLine[]
  note: string | null
}

export interface ReceiptSpec {
  provider: string
  description: string
  amountCents: number
  date: string
  format: 'jpg' | 'png'
}

/** Seeded statements are re-rendered on demand; uploaded files are kept in IndexedDB. */
export type DocumentSource =
  | { kind: 'statement'; statement: StatementSpec }
  | { kind: 'receipt'; receipt: ReceiptSpec }
  | { kind: 'upload' }

export interface DocumentRow {
  id: string
  userId: string
  billId: string
  versionNumber: number
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
  source: DocumentSource
}

export interface NotificationRow {
  id: string
  userId: string
  billId: string
  type: NotificationType
  referenceDate: string
  title: string
  body: string
  createdAt: string
  readAt: string | null
  /** Insertion order, the tie-breaker for reminders created in the same instant. */
  seq: number
}

export interface Db {
  schema: 1
  users: UserRow[]
  categories: CategoryRow[]
  providers: ProviderRow[]
  schedules: ScheduleRow[]
  occurrences: OccurrenceRow[]
  bills: BillRow[]
  documents: DocumentRow[]
  notifications: NotificationRow[]
  /** Stands in for the refresh cookie: the signed-in household, shared by every tab. */
  sessionUserId: string | null
  seq: number
}

export function emptyDb(): Db {
  return {
    schema: 1,
    users: [],
    categories: [],
    providers: [],
    schedules: [],
    occurrences: [],
    bills: [],
    documents: [],
    notifications: [],
    sessionUserId: null,
    seq: 0,
  }
}

const STORAGE_KEY = 'papertrail-demo:db:v1'

let memoryCopy: string | null = null
let cached: { raw: string; db: Db } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return memoryCopy
  }
}

/** The current database, re-read when another tab has saved since this tab last looked. */
export function loadDb(): Db | null {
  const raw = readRaw()
  if (raw === null) {
    cached = null
    return null
  }
  if (cached?.raw === raw) return cached.db
  try {
    const db = JSON.parse(raw) as Db
    if (db.schema !== 1) return null
    cached = { raw, db }
    return db
  } catch {
    return null
  }
}

export function saveDb(db: Db) {
  const raw = JSON.stringify(db)
  cached = { raw, db }
  memoryCopy = raw
  try {
    localStorage.setItem(STORAGE_KEY, raw)
  } catch {
    // Storage full or blocked: the demo keeps working from memory for this page.
  }
}

const FILE_DB = 'papertrail-demo-files'
const FILE_STORE = 'files'
const memoryFiles = new Map<string, Blob>()
let fileDb: Promise<IDBDatabase | null> | null = null

function openFiles(): Promise<IDBDatabase | null> {
  fileDb ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(FILE_DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return fileDb
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openFiles().then((idb) => new Promise((resolve) => {
    if (!idb) return resolve(null)
    try {
      const request = action(idb.transaction(FILE_STORE, mode).objectStore(FILE_STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  }))
}

export async function putFile(id: string, blob: Blob) {
  memoryFiles.set(id, blob)
  await run('readwrite', (store) => store.put(blob, id))
}

export async function getFile(id: string): Promise<Blob | null> {
  return memoryFiles.get(id) ?? (await run<Blob | undefined>('readonly', (store) => store.get(id))) ?? null
}

export async function deleteFiles(ids: string[]) {
  for (const id of ids) {
    memoryFiles.delete(id)
    await run('readwrite', (store) => store.delete(id))
  }
}

/** Forgets every demo household and file in this browser; the next request seeds a fresh demo. */
export async function resetDemo() {
  cached = null
  memoryCopy = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored.
  }
  memoryFiles.clear()
  await run('readwrite', (store) => store.clear())
}
