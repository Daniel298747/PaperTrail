import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>This page isn&rsquo;t in the ledger</h1>
      <p className="secondary" style={{ margin: '0.75rem 0 1.5rem' }}>
        The address may be mistyped, or the page has moved.
      </p>
      <Link to="/" className="btn btn-primary">Back to overview</Link>
    </div>
  )
}

/** Last-resort boundary for errors thrown while rendering a route. */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}`
    : error instanceof Error ? error.message : 'Unknown error'
  return (
    <div className="main">
      <div className="not-found">
        <p className="eyebrow">Something went wrong</p>
        <h1>This page couldn&rsquo;t be shown</h1>
        <p className="secondary" style={{ margin: '0.75rem 0 1.5rem' }}>{message}</p>
        <a href={import.meta.env.BASE_URL} className="btn btn-primary">Reload PaperTrail</a>
      </div>
    </div>
  )
}
