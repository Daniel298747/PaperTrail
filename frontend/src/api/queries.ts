import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  accountApi,
  analyticsApi,
  billsApi,
  categoriesApi,
  documentsApi,
  notificationsApi,
  providersApi,
  schedulesApi,
} from './endpoints'
import type { AnalyticsRange, BillQuery, DocumentQuery } from './types'

export const keys = {
  account: ['account'] as const,
  bills: ['bills'] as const,
  billList: (params: BillQuery) => ['bills', 'list', params] as const,
  bill: (id: string) => ['bills', 'detail', id] as const,
  documents: ['documents'] as const,
  archive: (params: DocumentQuery) => ['documents', 'archive', params] as const,
  providers: ['providers'] as const,
  categories: ['categories'] as const,
  schedules: ['schedules'] as const,
  schedule: (id: string) => ['schedules', id] as const,
  notifications: ['notifications'] as const,
  notificationList: (unreadOnly: boolean, page: number) => ['notifications', 'list', unreadOnly, page] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  analytics: ['analytics'] as const,
  summary: (params: AnalyticsRange) => ['analytics', 'summary', params] as const,
  monthly: (params: AnalyticsRange) => ['analytics', 'monthly', params] as const,
  categoryBreakdown: (params: AnalyticsRange) => ['analytics', 'categories', params] as const,
  providerTrends: (params: AnalyticsRange) => ['analytics', 'providers', params] as const,
}

export const useAccount = () => useQuery({ queryKey: keys.account, queryFn: accountApi.get })

export const useBills = (params: BillQuery) =>
  useQuery({ queryKey: keys.billList(params), queryFn: () => billsApi.list(params), placeholderData: keepPreviousData })

export const useBill = (id: string) => useQuery({ queryKey: keys.bill(id), queryFn: () => billsApi.get(id) })

export const useArchive = (params: DocumentQuery) =>
  useQuery({ queryKey: keys.archive(params), queryFn: () => documentsApi.archive(params), placeholderData: keepPreviousData })

export const useProviders = () => useQuery({ queryKey: keys.providers, queryFn: providersApi.list })

export const useCategories = () => useQuery({ queryKey: keys.categories, queryFn: categoriesApi.list })

export const useSchedules = () => useQuery({ queryKey: keys.schedules, queryFn: schedulesApi.list })

export const useSchedule = (id: string) => useQuery({ queryKey: keys.schedule(id), queryFn: () => schedulesApi.get(id) })

export const useNotifications = (unreadOnly: boolean, page: number) =>
  useQuery({
    queryKey: keys.notificationList(unreadOnly, page),
    queryFn: () => notificationsApi.list({ unreadOnly, page, size: 20 }),
    placeholderData: keepPreviousData,
  })

export const useUnreadCount = (enabled = true) =>
  useQuery({
    queryKey: keys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
    enabled,
  })

export const useSummary = (params: AnalyticsRange = {}) =>
  useQuery({ queryKey: keys.summary(params), queryFn: () => analyticsApi.summary(params), placeholderData: keepPreviousData })

export const useMonthly = (params: AnalyticsRange = {}) =>
  useQuery({ queryKey: keys.monthly(params), queryFn: () => analyticsApi.monthly(params), placeholderData: keepPreviousData })

export const useCategoryBreakdown = (params: AnalyticsRange = {}) =>
  useQuery({
    queryKey: keys.categoryBreakdown(params),
    queryFn: () => analyticsApi.categories(params),
    placeholderData: keepPreviousData,
  })

export const useProviderTrends = (params: AnalyticsRange = {}) =>
  useQuery({
    queryKey: keys.providerTrends(params),
    queryFn: () => analyticsApi.providers(params),
    placeholderData: keepPreviousData,
  })

/** Anything that changes a bill can move balances, reminders, archive rows and schedule summaries. */
export function useInvalidateLedger() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.bills }),
      client.invalidateQueries({ queryKey: keys.analytics }),
      client.invalidateQueries({ queryKey: keys.notifications }),
      client.invalidateQueries({ queryKey: keys.documents }),
      client.invalidateQueries({ queryKey: keys.schedules }),
      client.invalidateQueries({ queryKey: keys.providers }),
      client.invalidateQueries({ queryKey: keys.categories }),
      client.invalidateQueries({ queryKey: keys.account }),
    ])
}

export function useMarkPaid() {
  const invalidate = useInvalidateLedger()
  return useMutation({
    mutationFn: ({ id, paidDate }: { id: string; paidDate?: string }) => billsApi.markPaid(id, paidDate),
    onSuccess: invalidate,
  })
}

export function useMarkUnpaid() {
  const invalidate = useInvalidateLedger()
  return useMutation({ mutationFn: (id: string) => billsApi.markUnpaid(id), onSuccess: invalidate })
}

export function useUploadDocument() {
  const invalidate = useInvalidateLedger()
  return useMutation({
    mutationFn: ({ billId, file }: { billId: string; file: File }) => documentsApi.upload(billId, file),
    onSuccess: invalidate,
  })
}
