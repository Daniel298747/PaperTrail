import type { CategoryBreakdown, MonthlyTotals, ProviderTrends } from '../../api/types'
import { formatMonth, formatMonthLong, formatMonthShort, money, moneyCompact, plural } from '../../lib/format'
import { ChartFrame } from './ChartFrame'
import { ColumnChart, type ColumnSeries } from './ColumnChart'

const BILLED = { label: 'Billed', color: 'var(--series-1)' }
const PAID = { label: 'Paid', color: 'var(--series-2)' }

function monthTick(month: string, index: number): [string, string?] {
  const isJanuary = month.endsWith('-01')
  return [formatMonthShort(month), index === 0 || isJanuary ? month.slice(0, 4) : undefined]
}

/** Billed (by due date) per month, optionally beside paid (by payment date). */
export function MonthlyChart({ data, withPaid, title, description, height, refetching }: {
  data: MonthlyTotals
  withPaid: boolean
  title: string
  description: string
  height?: number
  refetching?: boolean
}) {
  const { currency } = data
  const categories = data.months.map((m) => m.month)
  const series: ColumnSeries[] = [
    {
      key: 'billed',
      ...BILLED,
      values: data.months.map((m) => Number(m.billed)),
      display: data.months.map((m) => money(m.billed, currency)),
    },
  ]
  if (withPaid) {
    series.push({
      key: 'paid',
      ...PAID,
      values: data.months.map((m) => Number(m.paid)),
      display: data.months.map((m) => money(m.paid, currency)),
    })
  }
  const empty = data.months.every((m) => Number(m.billed) === 0 && Number(m.paid) === 0)

  const table = (
    <table className="ledger">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          <th scope="col" className="col-num">Billed</th>
          <th scope="col" className="col-num">Paid</th>
        </tr>
      </thead>
      <tbody>
        {data.months.map((m) => (
          <tr key={m.month}>
            <th scope="row">{formatMonthLong(m.month)}</th>
            <td className="col-num">{money(m.billed, currency)} <span className="muted small">· {m.billedCount}</span></td>
            <td className="col-num">{money(m.paid, currency)} <span className="muted small">· {m.paidCount}</span></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="col-num">{money(data.billedTotal, currency)}</td>
          <td className="col-num">{money(data.paidTotal, currency)}</td>
        </tr>
      </tfoot>
    </table>
  )

  return (
    <ChartFrame
      title={title}
      description={description}
      legend={withPaid ? [BILLED, PAID] : undefined}
      table={table}
      refetching={refetching}
    >
      {empty ? (
        <p className="chart-empty">No bills fall in this period yet.</p>
      ) : (
        <ColumnChart
          categories={categories}
          categoryLabel={formatMonthLong}
          tickLabel={monthTick}
          series={series}
          formatTick={(value) => moneyCompact(value, currency)}
          ariaLabel={`${title}, ${formatMonth(categories[0])} to ${formatMonth(categories[categories.length - 1])}`}
          height={height}
        />
      )}
    </ChartFrame>
  )
}

/** Sorted horizontal bars; every value is labelled at the bar tip, so the list doubles as its own table. */
export function CategoryBars({ data, refetching }: { data: CategoryBreakdown; refetching?: boolean }) {
  const max = Math.max(0, ...data.categories.map((c) => Number(c.total)))
  return (
    <ChartFrame
      title="Billed by category"
      description={`Due dates ${formatMonth(data.from)} to ${formatMonth(data.to)} · total ${money(data.total, data.currency)}`}
      refetching={refetching}
    >
      {data.categories.length === 0 ? (
        <p className="chart-empty">No bills fall in this period yet.</p>
      ) : (
        <ol className="hbars">
          {data.categories.map((category) => {
            const ratio = max > 0 ? Number(category.total) / max : 0
            return (
              <li key={category.categoryId}>
                <span className="hbar-label">{category.name}</span>
                <span className="hbar-row">
                  <span
                    className="hbar-fill"
                    style={{ width: `calc((100% - 9.75rem) * ${ratio.toFixed(4)})` }}
                    aria-hidden="true"
                  />
                  <span className="hbar-value">
                    {money(category.total, data.currency)}
                    <span className="muted">{category.sharePercent}%</span>
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </ChartFrame>
  )
}

/** One small panel per provider, each on its own scale; the table view lists every month. */
export function ProviderMultiples({ data, refetching }: { data: ProviderTrends; refetching?: boolean }) {
  const { currency } = data
  const table = (
    <div style={{ overflowX: 'auto' }}>
      <table className="ledger">
        <caption className="sr-only">Billed per provider per month</caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col" className="col-num">Total</th>
            <th scope="col" className="col-num">Per month</th>
            {data.months.map((month) => (
              <th scope="col" key={month} className="col-num">{formatMonth(month)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.providers.map((provider) => (
            <tr key={provider.providerId}>
              <th scope="row">{provider.name}</th>
              <td className="col-num">{money(provider.total, currency)}</td>
              <td className="col-num">{money(provider.averagePerMonth, currency)}</td>
              {provider.values.map((value, index) => (
                <td key={data.months[index]} className="col-num">{money(value, currency)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <ChartFrame
      title="Cost by provider"
      description="Billed per month for each provider. Each panel uses its own scale; compare providers by their totals."
      table={table}
      refetching={refetching}
    >
      {data.providers.length === 0 ? (
        <p className="chart-empty">No bills fall in this period yet.</p>
      ) : (
        <div className="multiples">
          {data.providers.map((provider) => (
            <section className="multiple" key={provider.providerId} aria-label={provider.name}>
              <div className="multiple-head">
                <h3>{provider.name}</h3>
                <span className="multiple-total">{money(provider.total, currency)}</span>
              </div>
              <p className="multiple-sub">
                {money(provider.averagePerMonth, currency)} a month · {plural(provider.billCount, 'bill')}
              </p>
              <ColumnChart
                compact
                height={78}
                categories={data.months}
                categoryLabel={formatMonthLong}
                tickLabel={(month) => [formatMonth(month)]}
                series={[{
                  key: provider.providerId,
                  label: 'Billed',
                  color: 'var(--series-1)',
                  values: provider.values.map(Number),
                  display: provider.values.map((value) => money(value, currency)),
                }]}
                formatTick={(value) => moneyCompact(value, currency)}
                ariaLabel={`${provider.name}, billed per month`}
              />
            </section>
          ))}
        </div>
      )}
    </ChartFrame>
  )
}
