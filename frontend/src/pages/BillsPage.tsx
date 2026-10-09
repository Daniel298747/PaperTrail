import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useBills, useCategories, useProviders } from '../api/queries'
import type { BillQuery, BillStatusFilter } from '../api/types'
import { Icon } from '../components/Icon'
import {
  DueHint,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Pagination,
  StatusLabel,
} from '../components/ui'
import { formatDate, money } from '../lib/format'
import { usePayBill } from '../components/usePayBill'
import { useSearchParamSync } from '../lib/useDebouncedValue'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const STATUS_OPTIONS: { value: BillStatusFilter | ''; label: string }[] = [
  { value: '', label: 'All bills' },
  { value: 'outstanding', label: 'Unpaid (incl. overdue)' },
  { value: 'unpaid', label: 'Unpaid, not yet due' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
]

function SortHeader({ field, label, sort, onSort, numeric }: {
  field: string
  label: string
  sort: string
  onSort: (sort: string) => void
  numeric?: boolean
}) {
  const [current, direction] = sort.split(',')
  const active = current === field
  const ariaSort = active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'
  return (
    <th scope="col" aria-sort={ariaSort} className={numeric ? 'col-num' : undefined}>
      <button
        type="button"
        className="sort-button"
        onClick={() => onSort(active && direction !== 'desc' ? `${field},desc` : `${field},asc`)}
      >
        {label}
        <Icon name={active && direction === 'desc' ? 'chevronDown' : 'chevronUp'} size={12} className="sort-indicator" />
      </button>
    </th>
  )
}

export function BillsPage() {
  useDocumentTitle('Bills')
  const [params, setParams] = useSearchParams()
  const query: BillQuery = {
    q: params.get('q') ?? '',
    status: (params.get('status') ?? '') as BillStatusFilter | '',
    providerId: params.get('provider') ?? '',
    categoryId: params.get('category') ?? '',
    scheduleId: params.get('schedule') ?? '',
    dueFrom: params.get('from') ?? '',
    dueTo: params.get('to') ?? '',
    sort: params.get('sort') ?? 'dueDate,desc',
    page: Number(params.get('page') ?? 0),
    size: 20,
  }
  const bills = useBills(query)
  const providers = useProviders()
  const categories = useCategories()
  const { pay, pendingId } = usePayBill()
  const [search, setSearch] = useState(query.q ?? '')

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Debounce typing into the URL so the list doesn't refetch on every keystroke.
  useSearchParamSync(search, 'q', setParams)

  const filtered = Boolean(query.q || query.status || query.providerId || query.categoryId || query.scheduleId
    || query.dueFrom || query.dueTo)

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Bills"
        lede="Every bill in your household, paid and unpaid. Overdue status comes from the due date in your timezone."
        actions={
          <>
            <Link to="/bills/new" className="btn btn-primary"><Icon name="plus" />Add bill</Link>
            <Link to="/recurring/new" className="btn btn-secondary"><Icon name="repeat" />New recurring bill</Link>
          </>
        }
      />

      <form className="filters" role="search" aria-label="Filter bills" onSubmit={(event) => event.preventDefault()}>
        <div className="field grow">
          <label className="field-label" htmlFor="bill-search">Search</label>
          <input id="bill-search" className="input" type="search" placeholder="Title, provider, category or notes"
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bill-status">Status</label>
          <select id="bill-status" className="select" value={query.status}
            onChange={(event) => update({ status: event.target.value })}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bill-provider">Provider</label>
          <select id="bill-provider" className="select" value={query.providerId}
            onChange={(event) => update({ provider: event.target.value })}>
            <option value="">All providers</option>
            {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bill-category">Category</label>
          <select id="bill-category" className="select" value={query.categoryId}
            onChange={(event) => update({ category: event.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bill-from">Due from</label>
          <input id="bill-from" className="input" type="date" value={query.dueFrom}
            onChange={(event) => update({ from: event.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="bill-to">Due to</label>
          <input id="bill-to" className="input" type="date" value={query.dueTo}
            onChange={(event) => update({ to: event.target.value })} />
        </div>
        {filtered && (
          <button type="button" className="btn btn-text" onClick={() => {
            setSearch('')
            setParams(new URLSearchParams(), { replace: true })
          }}>
            Clear filters
          </button>
        )}
      </form>

      {bills.isPending ? <Loading label="Loading bills…" />
        : bills.isError ? <ErrorNotice error={bills.error} onRetry={() => bills.refetch()} />
          : bills.data.totalElements === 0 ? (
            filtered ? (
              <EmptyState title="No bills match these filters"
                action={<button type="button" className="btn btn-secondary" onClick={() => {
                  setSearch('')
                  setParams(new URLSearchParams(), { replace: true })
                }}>Clear filters</button>}>
                Try a wider date range or a different status.
              </EmptyState>
            ) : (
              <EmptyState title="No bills yet"
                action={<div className="btn-row">
                  <Link to="/bills/new" className="btn btn-primary">Add a bill</Link>
                  <Link to="/recurring/new" className="btn btn-secondary">Set up a recurring bill</Link>
                </div>}>
                Add a one-off bill, or set up a recurring schedule and PaperTrail will create each month&rsquo;s bill for you.
              </EmptyState>
            )
          ) : (
            <div className={`table-wrap ${bills.isPlaceholderData ? 'is-refetching' : ''}`}>
              <div className="results-meta" aria-live="polite">
                <span>
                  {bills.data.totalElements} {bills.data.totalElements === 1 ? 'bill' : 'bills'}
                  {query.scheduleId && ' from one recurring schedule'}
                </span>
              </div>
              <table className="ledger stack">
                <caption className="sr-only">Bills</caption>
                <thead>
                  <tr>
                    <SortHeader field="dueDate" label="Due" sort={query.sort!} onSort={(sort) => update({ sort })} />
                    <SortHeader field="title" label="Bill" sort={query.sort!} onSort={(sort) => update({ sort })} />
                    <SortHeader field="category" label="Category" sort={query.sort!} onSort={(sort) => update({ sort })} />
                    <SortHeader field="amount" label="Amount" numeric sort={query.sort!} onSort={(sort) => update({ sort })} />
                    <SortHeader field="status" label="Status" sort={query.sort!} onSort={(sort) => update({ sort })} />
                    <th scope="col" className="col-num">Docs</th>
                    <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {bills.data.content.map((bill) => (
                    <tr key={bill.id}>
                      <td className="col-date cell-meta">
                        {formatDate(bill.dueDate)}
                        <DueHint status={bill.status} daysUntilDue={bill.daysUntilDue} paidDate={bill.paidDate} />
                      </td>
                      <td className="cell-main">
                        <Link to={`/bills/${bill.id}`} className="primary-link">{bill.title}</Link>
                        <span className="sub">
                          {bill.provider.name}
                          {bill.schedule && <> · <Icon name="repeat" size={12} className="inline-icon" /> recurring</>}
                        </span>
                      </td>
                      <td className="cell-meta" data-label="Category">{bill.category.name}</td>
                      <td className="col-num cell-amount">{money(bill.amount, bill.currency)}</td>
                      <td className="cell-status"><StatusLabel status={bill.status} /></td>
                      <td className="col-num cell-hide-sm">
                        {bill.documentCount > 0
                          ? <span aria-label={`${bill.documentCount} statements`}>{bill.documentCount}</span>
                          : <span className="muted" aria-label="No statements">–</span>}
                      </td>
                      <td className="col-actions cell-actions">
                        {bill.status !== 'PAID' && (
                          <button type="button" className="btn btn-text accent" disabled={pendingId === bill.id}
                            onClick={() => pay(bill)} aria-label={`Mark ${bill.title} paid`}>
                            {pendingId === bill.id ? 'Saving…' : 'Mark paid'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={bills.data.page}
                totalPages={bills.data.totalPages}
                totalElements={bills.data.totalElements}
                noun="bill"
                onPage={(page) => update({ page: String(page) })}
              />
            </div>
          )}
    </>
  )
}
