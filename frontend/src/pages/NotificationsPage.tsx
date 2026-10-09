import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { notificationsApi } from '../api/endpoints'
import { useInvalidateLedger, useNotifications, useUnreadCount } from '../api/queries'
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Pagination,
  StatusLabel,
} from '../components/ui'
import { formatDateTime, money, relativeTime } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { useToast } from '../components/useToast'
import { errorMessage } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotificationsPage() {
  useDocumentTitle('Notifications')
  const household = useHousehold()
  const toast = useToast()
  const invalidate = useInvalidateLedger()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(0)
  const notifications = useNotifications(unreadOnly, page)
  const unread = useUnreadCount().data?.count ?? 0

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: invalidate,
    onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
  })
  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: async (result) => {
      await invalidate()
      toast.show(result.updated === 0 ? 'Nothing left to mark.' : `Marked ${result.updated} as read.`)
    },
    onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
  })

  function selectTab(value: boolean) {
    setUnreadOnly(value)
    setPage(0)
  }

  return (
    <>
      <PageHeader
        eyebrow="Household"
        title="Notifications"
        lede="Reminders arrive before each bill is due, using that bill's reminder setting, and once more if it becomes overdue."
        actions={
          <button type="button" className="btn btn-secondary" disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}>
            Mark all as read
          </button>
        }
      />
      <div className="tabs" role="tablist" aria-label="Show">
        <button type="button" role="tab" className="tab" aria-selected={!unreadOnly} onClick={() => selectTab(false)}>
          All
        </button>
        <button type="button" role="tab" className="tab" aria-selected={unreadOnly} onClick={() => selectTab(true)}>
          Unread {unread > 0 && <span className="count-badge" style={{ marginLeft: '0.35rem' }}>{unread}</span>}
        </button>
      </div>

      {notifications.isPending ? <Loading label="Loading notifications…" />
        : notifications.isError ? <ErrorNotice error={notifications.error} onRetry={() => notifications.refetch()} />
          : notifications.data.totalElements === 0 ? (
            <EmptyState title={unreadOnly ? "You're all caught up" : 'No notifications yet'}>
              {unreadOnly
                ? 'Every reminder has been read.'
                : 'Reminders show up here ahead of due dates. Each bill can set how many days of notice it gives.'}
            </EmptyState>
          ) : (
            <div className={notifications.isPlaceholderData ? 'is-refetching' : undefined}>
              <ol aria-label="Notifications">
                {notifications.data.content.map((item) => {
                  const unreadItem = item.readAt === null
                  return (
                    <li key={item.id} className={`notification ${unreadItem ? 'unread' : ''}`}>
                      <span className="dot" aria-hidden="true" />
                      <div>
                        <p className="notification-title">
                          {unreadItem && <span className="sr-only">Unread: </span>}
                          {item.title}
                        </p>
                        <p className="notification-body">{item.body}</p>
                        <div className="notification-meta">
                          {item.bill && <StatusLabel status={item.bill.status} />}
                          {item.bill && <span className="num">{money(item.bill.amount, item.bill.currency)}</span>}
                          <time dateTime={item.createdAt} title={formatDateTime(item.createdAt, household.timezone)}>
                            {relativeTime(item.createdAt)}
                          </time>
                        </div>
                      </div>
                      <div className="notification-actions">
                        {item.bill && (
                          <Link to={`/bills/${item.bill.id}`} onClick={() => unreadItem && markRead.mutate(item.id)}>
                            Open bill
                          </Link>
                        )}
                        {unreadItem && (
                          <button type="button" className="btn btn-text" disabled={markRead.isPending}
                            onClick={() => markRead.mutate(item.id)}>
                            Mark read
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
              <Pagination page={notifications.data.page} totalPages={notifications.data.totalPages}
                totalElements={notifications.data.totalElements} noun="notification" onPage={setPage} />
            </div>
          )}
    </>
  )
}
