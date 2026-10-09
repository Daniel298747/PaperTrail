import type { ReactNode } from 'react'

import { ApiError } from '../api/client'
import type { BillStatus } from '../api/types'
import { dueHint, money, moneyParts } from '../lib/format'
import { Icon } from './Icon'

export function PageHeader({ eyebrow, title, lede, actions, children }: {
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {children}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lede && <p className="page-header-lede">{lede}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

const STATUS_TEXT: Record<BillStatus, string> = { PAID: 'Paid', UNPAID: 'Unpaid', OVERDUE: 'Overdue' }

/** Status is always spelled out and paired with a shape, so colour is never the only signal. */
export function StatusLabel({ status }: { status: BillStatus }) {
  const icon = status === 'PAID' ? 'check' : status === 'OVERDUE' ? 'alert' : 'circle'
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <Icon name={icon} size={12} />
      {STATUS_TEXT[status]}
    </span>
  )
}

export function DueHint({ status, daysUntilDue, paidDate }: {
  status: BillStatus
  daysUntilDue: number
  paidDate: string | null
}) {
  const hint = dueHint(status, daysUntilDue, paidDate)
  return <span className={`due-hint ${hint.tone}`}>{hint.text}</span>
}

/** Large amounts: whole units at full size, currency symbol and cents set smaller. */
export function MoneyFigure({ amount, currency, className }: { amount: string; currency: string; className?: string }) {
  const parts = moneyParts(amount, currency)
  return (
    <span className={`money ${className ?? ''}`}>
      <span className="sr-only">{money(amount, currency)}</span>
      <span aria-hidden="true">
        {parts.prefix && <span className="money-symbol">{parts.prefix.trim()}</span>}
        {parts.whole}
        {parts.fraction && <span className="money-fraction">{parts.fraction}</span>}
        {parts.suffix && <span className="money-symbol">{parts.suffix.trim()}</span>}
      </span>
    </span>
  )
}

/** Shown while the first route's code loads. */
export function BootScreen() {
  return <div className="main"><Loading label="Opening PaperTrail…" /></div>
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-rule" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorNotice({ error, title = 'This could not be loaded', onRetry }: {
  error: unknown
  title?: string
  onRetry?: () => void
}) {
  const message = error instanceof ApiError ? error.message
    : 'Something went wrong. Check your connection and try again.'
  return (
    <div className="notice" role="alert">
      <Icon name="alert" />
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
        {onRetry && (
          <div style={{ marginTop: '0.6rem' }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={onRetry}>Try again</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action, compact }: {
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`state ${compact ? 'compact' : ''}`}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" id={id}>
      <Icon name="alert" size={14} />
      <span>{message}</span>
    </p>
  )
}

/** Label + control + help/error, with aria wiring handled by the caller via ids. */
export function Field({ label, htmlFor, error, help, optional, className, children }: {
  label: string
  htmlFor: string
  error?: string
  help?: ReactNode
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label} {optional && <span className="optional">(optional)</span>}
      </label>
      {children}
      {help && !error && <p className="field-help" id={`${htmlFor}-help`}>{help}</p>}
      <FieldError id={`${htmlFor}-error`} message={error} />
    </div>
  )
}

export function Pagination({ page, totalPages, totalElements, noun, onPage }: {
  page: number
  totalPages: number
  totalElements: number
  noun: string
  onPage: (page: number) => void
}) {
  if (totalElements === 0) return null
  return (
    <nav className="pagination" aria-label={`${noun} pages`}>
      <span className="num">
        Page {page + 1} of {Math.max(totalPages, 1)} · {totalElements} {totalElements === 1 ? noun : `${noun}s`}
      </span>
      <span className="btn-row">
        <button type="button" className="btn btn-secondary btn-small" disabled={page <= 0}
          onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className="btn btn-secondary btn-small" disabled={page + 1 >= totalPages}
          onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </nav>
  )
}

