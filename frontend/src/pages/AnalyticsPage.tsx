import { useSearchParams } from 'react-router'

import { useCategoryBreakdown, useMonthly, useProviderTrends, useProviders, useSummary } from '../api/queries'
import type { AnalyticsRange } from '../api/types'
import { CategoryBars, MonthlyChart, ProviderMultiples } from '../components/charts/LedgerCharts'
import { ErrorNotice, Loading, PageHeader } from '../components/ui'
import { formatMonth, money, plural, shiftMonth } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const PRESETS = [
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'This year' },
  { value: '24m', label: 'Last 24 months' },
  { value: 'custom', label: 'Custom range' },
]

function presetRange(preset: string, currentMonth: string): { from: string; to: string } {
  switch (preset) {
    case '6m':
      return { from: shiftMonth(currentMonth, -5), to: currentMonth }
    case 'ytd':
      return { from: `${currentMonth.slice(0, 4)}-01`, to: currentMonth }
    case '24m':
      return { from: shiftMonth(currentMonth, -23), to: currentMonth }
    default:
      return { from: shiftMonth(currentMonth, -11), to: currentMonth }
  }
}

export function AnalyticsPage() {
  useDocumentTitle('Analytics')
  const household = useHousehold()
  const [params, setParams] = useSearchParams()
  const currentMonth = household.today.slice(0, 7)
  const preset = params.get('range') ?? '12m'
  const range = preset === 'custom'
    ? {
      from: params.get('from') ?? shiftMonth(currentMonth, -11),
      to: params.get('to') ?? currentMonth,
    }
    : presetRange(preset, currentMonth)
  const providerId = params.get('provider') ?? ''
  const filter: AnalyticsRange = { from: range.from, to: range.to, providerId: providerId || undefined }

  const providers = useProviders()
  const summary = useSummary(filter)
  const monthly = useMonthly(filter)
  const categories = useCategoryBreakdown(filter)
  const trends = useProviderTrends(filter)

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  // Month choices for the custom range: the last five years up to the current month.
  const monthOptions = Array.from({ length: 60 }, (_, index) => shiftMonth(currentMonth, -index))
  const invalidRange = range.from > range.to

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Analytics"
        lede="Where the household's money goes, month by month, from your recorded bills."
      />

      <form className="filters" aria-label="Analytics filters" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label className="field-label" htmlFor="range">Period</label>
          <select id="range" className="select" value={preset} onChange={(event) => {
            const value = event.target.value
            if (value === 'custom') update({ range: value, from: range.from, to: range.to })
            else update({ range: value, from: '', to: '' })
          }}>
            {PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {preset === 'custom' && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="range-from">From</label>
              <select id="range-from" className="select" value={range.from} onChange={(event) => update({ from: event.target.value })}>
                {monthOptions.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="range-to">To</label>
              <select id="range-to" className="select" value={range.to} onChange={(event) => update({ to: event.target.value })}>
                {monthOptions.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="field grow">
          <label className="field-label" htmlFor="analytics-provider">Provider</label>
          <select id="analytics-provider" className="select" value={providerId}
            onChange={(event) => update({ provider: event.target.value })}>
            <option value="">All providers</option>
            {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </div>
      </form>

      <p className="definitions" style={{ margin: '0.9rem 0 1.5rem' }}>
        Billed totals group bills by their <strong>due date</strong>. Paid totals group payments by their{' '}
        <strong>payment date</strong>. Outstanding and overdue cover unpaid bills due in the selected period.
        All amounts are in {household.currency}.
      </p>

      {invalidRange ? (
        <ErrorNotice error={null} title="The start month is after the end month" />
      ) : (
        <>
          {summary.isPending ? <Loading label="Calculating totals…" />
            : summary.isError ? <ErrorNotice error={summary.error} onRetry={() => summary.refetch()} />
              : (
                <dl className={`kpis ${summary.isPlaceholderData ? 'is-refetching' : ''}`}>
                  <div className="kpi">
                    <dt className="eyebrow">Outstanding</dt>
                    <dd>
                      <span className="kpi-value">{money(summary.data.outstanding.total, summary.data.currency)}</span>
                      <span className="kpi-sub">{plural(summary.data.outstanding.count, 'unpaid bill')}</span>
                    </dd>
                  </div>
                  <div className="kpi">
                    <dt className="eyebrow">Overdue</dt>
                    <dd>
                      <span className="kpi-value">{money(summary.data.overdue.total, summary.data.currency)}</span>
                      <span className="kpi-sub">{plural(summary.data.overdue.count, 'bill')}</span>
                    </dd>
                  </div>
                  <div className="kpi">
                    <dt className="eyebrow">Billed</dt>
                    <dd>
                      <span className="kpi-value">{money(summary.data.billed.total, summary.data.currency)}</span>
                      <span className="kpi-sub">{plural(summary.data.billed.count, 'bill')} by due date</span>
                    </dd>
                  </div>
                  <div className="kpi">
                    <dt className="eyebrow">Paid</dt>
                    <dd>
                      <span className="kpi-value">{money(summary.data.paid.total, summary.data.currency)}</span>
                      <span className="kpi-sub">{plural(summary.data.paid.count, 'payment')} by payment date</span>
                    </dd>
                  </div>
                </dl>
              )}

          <section className="section" style={{ marginTop: '1.5rem' }}>
            {monthly.isPending ? <Loading label="Loading monthly totals…" />
              : monthly.isError ? <ErrorNotice error={monthly.error} onRetry={() => monthly.refetch()} />
                : (
                  <MonthlyChart
                    data={monthly.data}
                    withPaid
                    title="Billed and paid by month"
                    description={`${formatMonth(monthly.data.from)} to ${formatMonth(monthly.data.to)}. Billed ${money(monthly.data.billedTotal, monthly.data.currency)}, paid ${money(monthly.data.paidTotal, monthly.data.currency)}.`}
                    height={280}
                    refetching={monthly.isPlaceholderData}
                  />
                )}
          </section>

          <section className="section split collapse-md">
            <div className="span-5">
              {categories.isPending ? <Loading label="Loading categories…" />
                : categories.isError ? <ErrorNotice error={categories.error} onRetry={() => categories.refetch()} />
                  : <CategoryBars data={categories.data} refetching={categories.isPlaceholderData} />}
            </div>
            <div className="span-7 divided-left">
              {trends.isPending ? <Loading label="Loading provider trends…" />
                : trends.isError ? <ErrorNotice error={trends.error} onRetry={() => trends.refetch()} />
                  : <ProviderMultiples data={trends.data} refetching={trends.isPlaceholderData} />}
            </div>
          </section>
        </>
      )}
    </>
  )
}
