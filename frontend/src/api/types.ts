// DTOs mirrored from the Spring Boot API. Money is a decimal string ("84.20"); dates are ISO
// calendar dates ("2026-10-07"); instants are ISO-8601 timestamps.

export type BillStatus = 'PAID' | 'UNPAID' | 'OVERDUE'
export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

export interface NamedRef {
  id: string
  name: string
}

export interface Account {
  id: string
  email: string
  displayName: string
  currency: string
  timezone: string
  defaultReminderLeadDays: number
  today: string
  currencyLocked: boolean
  createdAt: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: string
  expiresAt: string
  account: Account
}

export interface Page<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface BillSummary {
  id: string
  title: string
  provider: NamedRef
  category: NamedRef
  amount: string
  currency: string
  dueDate: string
  status: BillStatus
  paidDate: string | null
  daysUntilDue: number
  documentCount: number
  schedule: NamedRef | null
  version: number
}

export interface DocumentVersion {
  id: string
  billId: string
  versionNumber: number
  filename: string
  contentType: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
  latest: boolean
}

export interface BillDetail {
  id: string
  title: string
  provider: NamedRef
  category: NamedRef
  amount: string
  currency: string
  dueDate: string
  status: BillStatus
  paidDate: string | null
  daysUntilDue: number
  reminderLeadDays: number
  notes: string | null
  schedule: NamedRef | null
  documents: DocumentVersion[]
  createdAt: string
  updatedAt: string
  version: number
}

export interface BillInput {
  title: string
  providerId: string
  categoryId: string
  amount: string
  dueDate: string
  reminderLeadDays?: number | null
  notes?: string | null
  version?: number
}

export type BillStatusFilter = 'outstanding' | 'unpaid' | 'overdue' | 'paid'

export interface BillQuery {
  q?: string
  status?: BillStatusFilter | ''
  providerId?: string
  categoryId?: string
  scheduleId?: string
  dueFrom?: string
  dueTo?: string
  sort?: string
  page?: number
  size?: number
}

export interface Provider {
  id: string
  name: string
  defaultCategory: NamedRef | null
  billCount: number
  scheduleCount: number
}

export interface Category {
  id: string
  name: string
  billCount: number
  scheduleCount: number
}

export interface Schedule {
  id: string
  title: string
  provider: NamedRef
  category: NamedRef
  amount: string
  currency: string
  frequency: Frequency
  startDate: string
  billingDay: number
  reminderLeadDays: number
  active: boolean
  notes: string | null
  upcoming: string[]
  lastGenerated: string | null
  generatedCount: number
  createdAt: string
  version: number
}

export interface ScheduleDetail {
  schedule: Schedule
  recentBills: BillSummary[]
}

export interface ScheduleInput {
  title: string
  providerId: string
  categoryId: string
  amount: string
  frequency: Frequency
  startDate: string
  billingDay: number
  reminderLeadDays: number
  active?: boolean
  notes?: string | null
  version?: number
}

export interface ArchiveDocument {
  id: string
  billId: string
  billTitle: string
  billDueDate: string
  provider: NamedRef
  category: NamedRef
  versionNumber: number
  versionCount: number
  latest: boolean
  filename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
}

export interface DocumentQuery {
  q?: string
  providerId?: string
  latestOnly?: boolean
  sort?: string
  page?: number
  size?: number
}

export interface DocumentLink {
  url: string
  expiresAt: string
  filename: string
  contentType: string
  disposition: 'inline' | 'attachment'
}

export interface AppNotification {
  id: string
  type: 'BILL_DUE_SOON' | 'BILL_OVERDUE'
  title: string
  body: string
  referenceDate: string
  createdAt: string
  readAt: string | null
  bill: {
    id: string
    title: string
    providerName: string
    amount: string
    currency: string
    dueDate: string
    status: BillStatus
  } | null
}

export interface Figure {
  total: string
  count: number
}

export interface AnalyticsSummary {
  currency: string
  today: string
  from: string
  to: string
  rangeApplied: boolean
  providerId: string | null
  outstanding: Figure
  overdue: Figure
  dueNext7Days: Figure
  billed: Figure
  paid: Figure
}

export interface MonthTotals {
  month: string
  billed: string
  billedCount: number
  paid: string
  paidCount: number
}

export interface MonthlyTotals {
  currency: string
  from: string
  to: string
  providerId: string | null
  months: MonthTotals[]
  billedTotal: string
  paidTotal: string
}

export interface CategoryShare {
  categoryId: string
  name: string
  total: string
  billCount: number
  sharePercent: string
}

export interface CategoryBreakdown {
  currency: string
  from: string
  to: string
  providerId: string | null
  total: string
  categories: CategoryShare[]
}

export interface ProviderSeries {
  providerId: string
  name: string
  total: string
  averagePerMonth: string
  billCount: number
  values: string[]
}

export interface ProviderTrends {
  currency: string
  from: string
  to: string
  months: string[]
  providers: ProviderSeries[]
}

export interface AnalyticsRange {
  from?: string
  to?: string
  providerId?: string
}
