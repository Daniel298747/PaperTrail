import { query, request } from './client'
import type {
  Account,
  AnalyticsRange,
  AnalyticsSummary,
  AppNotification,
  ArchiveDocument,
  BillDetail,
  BillInput,
  BillQuery,
  BillSummary,
  Category,
  CategoryBreakdown,
  DocumentLink,
  DocumentQuery,
  DocumentVersion,
  MonthlyTotals,
  Page,
  Provider,
  ProviderTrends,
  Schedule,
  ScheduleDetail,
  ScheduleInput,
} from './types'

export const accountApi = {
  get: () => request<Account>('/api/account'),
  update: (body: Partial<Pick<Account, 'displayName' | 'timezone' | 'currency' | 'defaultReminderLeadDays'>>) =>
    request<Account>('/api/account', { method: 'PATCH', json: body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>('/api/account/password', { method: 'POST', json: body }),
}

export const billsApi = {
  list: (params: BillQuery) => request<Page<BillSummary>>(`/api/bills${query(params)}`),
  get: (id: string) => request<BillDetail>(`/api/bills/${id}`),
  create: (body: BillInput) => request<BillDetail>('/api/bills', { method: 'POST', json: body }),
  update: (id: string, body: BillInput) => request<BillDetail>(`/api/bills/${id}`, { method: 'PUT', json: body }),
  remove: (id: string) => request<void>(`/api/bills/${id}`, { method: 'DELETE' }),
  markPaid: (id: string, paidDate?: string) =>
    request<BillDetail>(`/api/bills/${id}/payment`, { method: 'POST', json: paidDate ? { paidDate } : {} }),
  markUnpaid: (id: string) => request<BillDetail>(`/api/bills/${id}/payment`, { method: 'DELETE' }),
}

export const documentsApi = {
  versions: (billId: string) => request<DocumentVersion[]>(`/api/bills/${billId}/documents`),
  upload: (billId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<DocumentVersion>(`/api/bills/${billId}/documents`, { method: 'POST', body: form })
  },
  archive: (params: DocumentQuery) => request<Page<ArchiveDocument>>(`/api/documents${query(params)}`),
  link: (id: string, download: boolean) =>
    request<DocumentLink>(`/api/documents/${id}/link${query({ download })}`),
}

export const providersApi = {
  list: () => request<Provider[]>('/api/providers'),
  create: (body: { name: string; defaultCategoryId?: string | null }) =>
    request<Provider>('/api/providers', { method: 'POST', json: body }),
  update: (id: string, body: { name: string; defaultCategoryId?: string | null }) =>
    request<Provider>(`/api/providers/${id}`, { method: 'PUT', json: body }),
  remove: (id: string, reassignTo?: string) =>
    request<void>(`/api/providers/${id}${query({ reassignTo })}`, { method: 'DELETE' }),
}

export const categoriesApi = {
  list: () => request<Category[]>('/api/categories'),
  create: (body: { name: string }) => request<Category>('/api/categories', { method: 'POST', json: body }),
  rename: (id: string, body: { name: string }) =>
    request<Category>(`/api/categories/${id}`, { method: 'PUT', json: body }),
  remove: (id: string, reassignTo?: string) =>
    request<void>(`/api/categories/${id}${query({ reassignTo })}`, { method: 'DELETE' }),
}

export const schedulesApi = {
  list: () => request<Schedule[]>('/api/schedules'),
  get: (id: string) => request<ScheduleDetail>(`/api/schedules/${id}`),
  create: (body: ScheduleInput) => request<ScheduleDetail>('/api/schedules', { method: 'POST', json: body }),
  update: (id: string, body: ScheduleInput) =>
    request<ScheduleDetail>(`/api/schedules/${id}`, { method: 'PUT', json: body }),
  pause: (id: string) => request<ScheduleDetail>(`/api/schedules/${id}/pause`, { method: 'POST' }),
  resume: (id: string) => request<ScheduleDetail>(`/api/schedules/${id}/resume`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/api/schedules/${id}`, { method: 'DELETE' }),
  preview: (body: { startDate: string; billingDay: number; frequency: string; count?: number }) =>
    request<{ dates: string[] }>('/api/schedules/preview', { method: 'POST', json: body }),
}

export const notificationsApi = {
  list: (params: { unreadOnly?: boolean; page?: number; size?: number }) =>
    request<Page<AppNotification>>(`/api/notifications${query(params)}`),
  unreadCount: () => request<{ count: number }>('/api/notifications/unread-count'),
  markRead: (id: string) => request<void>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<{ updated: number }>('/api/notifications/read-all', { method: 'POST' }),
}

export const analyticsApi = {
  summary: (params: AnalyticsRange = {}) => request<AnalyticsSummary>(`/api/analytics/summary${query(params)}`),
  monthly: (params: AnalyticsRange = {}) => request<MonthlyTotals>(`/api/analytics/monthly${query(params)}`),
  categories: (params: AnalyticsRange = {}) =>
    request<CategoryBreakdown>(`/api/analytics/categories${query(params)}`),
  providers: (params: AnalyticsRange = {}) => request<ProviderTrends>(`/api/analytics/providers${query(params)}`),
}
