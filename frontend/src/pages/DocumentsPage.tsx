import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useArchive, useProviders } from '../api/queries'
import { useHousehold } from '../auth/useAuth'
import { Icon } from '../components/Icon'
import { EmptyState, ErrorNotice, Loading, PageHeader, Pagination } from '../components/ui'
import { useDocumentViewer } from '../components/useDocumentViewer'
import { fileKind, fileSize, formatDate, formatInstantDate } from '../lib/format'
import { useSearchParamSync } from '../lib/useDebouncedValue'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function DocumentsPage() {
  useDocumentTitle('Documents')
  const household = useHousehold()
  const [params, setParams] = useSearchParams()
  const query = {
    q: params.get('q') ?? '',
    providerId: params.get('provider') ?? '',
    latestOnly: params.get('latest') === '1',
    sort: 'uploadedAt,desc',
    page: Number(params.get('page') ?? 0),
    size: 25,
  }
  const archive = useArchive(query)
  const providers = useProviders()
  const viewer = useDocumentViewer()
  const [search, setSearch] = useState(query.q)

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  useSearchParamSync(search, 'q', setParams)

  const filtered = Boolean(query.q || query.providerId || query.latestOnly)

  return (
    <>
      <PageHeader
        eyebrow="Archive"
        title="Documents"
        lede="Every statement you have uploaded, including earlier versions that a corrected statement replaced."
      />
      <form className="filters" role="search" aria-label="Filter documents" onSubmit={(event) => event.preventDefault()}>
        <div className="field grow">
          <label className="field-label" htmlFor="doc-search">Search</label>
          <input id="doc-search" className="input" type="search" placeholder="File name, bill or provider"
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="doc-provider">Provider</label>
          <select id="doc-provider" className="select" value={query.providerId}
            onChange={(event) => update({ provider: event.target.value })}>
            <option value="">All providers</option>
            {providers.data?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </div>
        <label className="checkbox" style={{ paddingBottom: '0.55rem' }}>
          <input type="checkbox" checked={query.latestOnly}
            onChange={(event) => update({ latest: event.target.checked ? '1' : '' })} />
          Latest version only
        </label>
      </form>

      {archive.isPending ? <Loading label="Loading documents…" />
        : archive.isError ? <ErrorNotice error={archive.error} onRetry={() => archive.refetch()} />
          : archive.data.totalElements === 0 ? (
            filtered ? (
              <EmptyState title="No documents match" action={
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setSearch('')
                  setParams(new URLSearchParams(), { replace: true })
                }}>Clear filters</button>
              }>Try another search or provider.</EmptyState>
            ) : (
              <EmptyState title="No statements yet"
                action={<Link to="/bills" className="btn btn-secondary">Go to bills</Link>}>
                Open a bill and upload its statement. PDF, JPG and PNG files are kept privately with every later version.
              </EmptyState>
            )
          ) : (
            <div className={archive.isPlaceholderData ? 'is-refetching' : undefined}>
              <table className="ledger stack">
                <caption className="sr-only">Statement archive</caption>
                <thead>
                  <tr>
                    <th scope="col">Uploaded</th>
                    <th scope="col">Document</th>
                    <th scope="col">Bill</th>
                    <th scope="col">Version</th>
                    <th scope="col" className="col-num">Size</th>
                    <th scope="col" className="col-actions"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {archive.data.content.map((document) => (
                    <tr key={document.id}>
                      <td className="col-date cell-meta">{formatInstantDate(document.uploadedAt, household.timezone)}</td>
                      <td className="cell-main">
                        <span className="tag" style={{ marginRight: '0.5rem' }}>{fileKind(document.contentType)}</span>
                        <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{document.filename}</span>
                      </td>
                      <td className="cell-meta">
                        <Link to={`/bills/${document.billId}`}>{document.billTitle}</Link>
                        <span className="sub">{document.provider.name} · due {formatDate(document.billDueDate)}</span>
                      </td>
                      <td className="cell-status">
                        <span className="num">v{document.versionNumber} of {document.versionCount}</span>
                        {document.latest && <> <span className="tag tag-accent">Latest</span></>}
                      </td>
                      <td className="col-num cell-hide-sm">{fileSize(document.sizeBytes)}</td>
                      <td className="col-actions cell-actions">
                        <span className="btn-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button type="button" className="btn btn-text" onClick={() => viewer.preview(document)}
                            aria-label={`Preview ${document.filename}`}>
                            <Icon name="eye" />Preview
                          </button>
                          <button type="button" className="btn btn-text" onClick={() => viewer.download(document)}
                            aria-label={`Download ${document.filename}`}>
                            <Icon name="download" />Download
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={archive.data.page} totalPages={archive.data.totalPages}
                totalElements={archive.data.totalElements} noun="document"
                onPage={(page) => update({ page: String(page) })} />
            </div>
          )}
      {viewer.dialog}
    </>
  )
}
