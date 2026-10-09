import { Link, useOutletContext } from 'react-router'

import { useArchive, useBills, useMonthly, useSummary } from '../api/queries'
import type { ShellContext } from '../components/AppShell'
import { MonthlyChart } from '../components/charts/LedgerCharts'
import { Icon } from '../components/Icon'
import {
  DueHint,
  EmptyState,
  ErrorNotice,
  Loading,
  MoneyFigure,
  PageHeader,
  StatusLabel,
} from '../components/ui'
import { fileKind, formatInstantDate, formatLongDate, formatMonthLong, formatShortDate, money, plural } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { usePayBill } from '../components/usePayBill'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function OverviewPage() {
  useDocumentTitle('Overview')
  const household = useHousehold()
  const { openUpload } = useOutletContext<ShellContext>()

  return (
    <>
      <PageHeader
        eyebrow={<span className="overview-date">{formatLongDate(household.today)}</span>}
        title={household.displayName}
        actions={
          <>
            <Link to="/bills/new" className="btn btn-primary"><Icon name="plus" />Add bill</Link>
            <button type="button" className="btn btn-secondary" onClick={openUpload}>
              <Icon name="upload" />Upload statement
            </button>
          </>
        }
      />
      <BalanceHero />
      <section className="section split collapse-md" aria-label="Upcoming bills and recent documents">
        <div className="span-8"><UpcomingBills /></div>
        <div className="span-4 divided-left"><RecentDocuments /></div>
      </section>
      <SpendingSection />
    </>
  )
}

function BalanceHero() {
  const summary = useSummary()
  if (summary.isPending) return <Loading label="Adding up your balance…" />
  if (summary.isError) return <ErrorNotice error={summary.error} onRetry={() => summary.refetch()} />
  const data = summary.data
  const { currency } = data
  const outstanding = data.outstanding

  return (
    <section className="hero" aria-labelledby="balance-label">
      <div>
        <p className="eyebrow" id="balance-label">Outstanding balance</p>
        <p className="hero-figure" data-testid="outstanding-balance">
          <MoneyFigure amount={outstanding.total} currency={currency} />
        </p>
        <p className="hero-note">
          {outstanding.count === 0
            ? 'Nothing is waiting to be paid.'
            : `Across ${plural(outstanding.count, 'unpaid bill')}${data.overdue.count > 0
              ? `, ${data.overdue.count} of them overdue.` : ', none overdue.'}`}
        </p>
        <div className="hero-actions btn-row">
          <Link to="/bills?status=outstanding" className="btn btn-secondary">Review unpaid bills</Link>
        </div>
      </div>
      <dl className="figure-list">
        <div className={`figure-row ${data.overdue.count > 0 ? 'alert' : ''}`}>
          <dt className="eyebrow">
            {data.overdue.count > 0 && <Icon name="alert" size={14} />}
            Overdue
          </dt>
          <dd>
            <span className="figure-value">{money(data.overdue.total, currency)}</span>
            <span className="figure-sub">{plural(data.overdue.count, 'bill')}</span>
          </dd>
        </div>
        <div className="figure-row">
          <dt className="eyebrow">Due in the next 7 days</dt>
          <dd>
            <span className="figure-value">{money(data.dueNext7Days.total, currency)}</span>
            <span className="figure-sub">{plural(data.dueNext7Days.count, 'bill')}</span>
          </dd>
        </div>
        <div className="figure-row">
          <dt className="eyebrow">Paid in {formatMonthLong(data.from)}</dt>
          <dd>
            <span className="figure-value">{money(data.paid.total, currency)}</span>
            <span className="figure-sub">{plural(data.paid.count, 'bill')}</span>
          </dd>
        </div>
        <div className="figure-row">
          <dt className="eyebrow">Billed in {formatMonthLong(data.from)}</dt>
          <dd>
            <span className="figure-value">{money(data.billed.total, currency)}</span>
            <span className="figure-sub">{plural(data.billed.count, 'bill')}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}

function UpcomingBills() {
  const bills = useBills({ status: 'outstanding', sort: 'dueDate,asc', size: 8 })
  const { pay, pendingId } = usePayBill()

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Upcoming bills</h2>
          <p>Unpaid bills by due date, overdue first.</p>
        </div>
        <Link to="/bills?status=outstanding">All unpaid bills</Link>
      </div>
      {bills.isPending ? <Loading label="Loading bills…" />
        : bills.isError ? <ErrorNotice error={bills.error} onRetry={() => bills.refetch()} />
          : bills.data.content.length === 0 ? (
            <EmptyState
              compact
              title="Nothing outstanding"
              action={<Link to="/bills/new" className="btn btn-secondary">Add a bill</Link>}
            >
              New bills appear here as they come due, including the ones your recurring schedules create.
            </EmptyState>
          ) : (
            <table className="ledger stack">
              <caption className="sr-only">Upcoming unpaid bills</caption>
              <thead>
                <tr>
                  <th scope="col">Due</th>
                  <th scope="col">Bill</th>
                  <th scope="col" className="col-num">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {bills.data.content.map((bill) => (
                  <tr key={bill.id}>
                    <td className="col-date cell-meta">
                      {formatShortDate(bill.dueDate)}
                      <DueHint status={bill.status} daysUntilDue={bill.daysUntilDue} paidDate={bill.paidDate} />
                    </td>
                    <td className="cell-main">
                      <Link to={`/bills/${bill.id}`} className="primary-link">{bill.title}</Link>
                      <span className="sub">{bill.provider.name}</span>
                    </td>
                    <td className="col-num cell-amount">{money(bill.amount, bill.currency)}</td>
                    <td className="cell-status"><StatusLabel status={bill.status} /></td>
                    <td className="col-actions cell-actions">
                      <button
                        type="button"
                        className="btn btn-text accent"
                        disabled={pendingId === bill.id}
                        onClick={() => pay(bill)}
                        aria-label={`Mark ${bill.title} paid`}
                      >
                        {pendingId === bill.id ? 'Saving…' : 'Mark paid'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
    </>
  )
}

function RecentDocuments() {
  const household = useHousehold()
  const documents = useArchive({ size: 5, sort: 'uploadedAt,desc' })
  return (
    <>
      <div className="section-head">
        <h2 className="h3">Recent documents</h2>
        <Link to="/documents" className="small">Archive</Link>
      </div>
      {documents.isPending ? <Loading label="Loading documents…" />
        : documents.isError ? <ErrorNotice error={documents.error} onRetry={() => documents.refetch()} />
          : documents.data.content.length === 0 ? (
            <p className="muted small">Statements you upload are listed here, newest first.</p>
          ) : (
            <ol className="doc-list">
              {documents.data.content.map((document) => (
                <li key={document.id}>
                  <span className="tag">{fileKind(document.contentType)}</span>
                  <Link to={`/bills/${document.billId}`} className="truncate">{document.filename}</Link>
                  <span className="doc-meta">
                    {document.billTitle} · v{document.versionNumber} · {formatInstantDate(document.uploadedAt, household.timezone)}
                  </span>
                </li>
              ))}
            </ol>
          )}
    </>
  )
}

function SpendingSection() {
  const monthly = useMonthly()
  if (monthly.isPending) return <section className="section"><Loading label="Loading monthly totals…" /></section>
  if (monthly.isError) {
    return <section className="section"><ErrorNotice error={monthly.error} onRetry={() => monthly.refetch()} /></section>
  }
  const data = monthly.data
  const highest = data.months.reduce((best, month) => (Number(month.billed) > Number(best.billed) ? month : best),
    data.months[0])

  return (
    <section className="section split collapse-md" aria-label="Monthly spending">
      <div className="span-8">
        <MonthlyChart
          data={data}
          withPaid={false}
          title="Monthly spending"
          description="Billed amounts by due date over the last 12 months."
          refetching={monthly.isFetching}
        />
      </div>
      <dl className="span-4 chart-notes">
        <div>
          <dt className="eyebrow">Billed, last 12 months</dt>
          <dd>{money(data.billedTotal, data.currency)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Paid, last 12 months</dt>
          <dd>{money(data.paidTotal, data.currency)}</dd>
        </div>
        {highest && Number(highest.billed) > 0 && (
          <div>
            <dt className="eyebrow">Highest month</dt>
            <dd>
              {money(highest.billed, data.currency)} <span className="muted">in {formatMonthLong(highest.month)}</span>
            </dd>
          </div>
        )}
        <div>
          <Link to="/analytics" className="small">Open analytics</Link>
        </div>
      </dl>
    </section>
  )
}
