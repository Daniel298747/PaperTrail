import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { ApiError } from '../api/client'
import { billsApi } from '../api/endpoints'
import { useBill, useInvalidateLedger, useMarkUnpaid, useUploadDocument } from '../api/queries'
import { MarkPaidDialog } from '../components/billActions'
import { ConfirmDialog } from '../components/Dialog'
import { StatementDropzone } from '../components/documents'
import { Icon } from '../components/Icon'
import {
  DueHint,
  EmptyState,
  ErrorNotice,
  Loading,
  MoneyFigure,
  StatusLabel,
} from '../components/ui'
import { fileKind, fileSize, formatDate, formatDateTime, money, plural } from '../lib/format'
import { useHousehold } from '../auth/useAuth'
import { useDocumentViewer } from '../components/useDocumentViewer'
import { useToast } from '../components/useToast'
import { errorMessage } from '../lib/forms'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function BillDetailPage() {
  const { id = '' } = useParams()
  const bill = useBill(id)
  const household = useHousehold()
  const navigate = useNavigate()
  const toast = useToast()
  const invalidate = useInvalidateLedger()
  const upload = useUploadDocument()
  const markUnpaid = useMarkUnpaid()
  const viewer = useDocumentViewer()
  const [payOpen, setPayOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: () => billsApi.remove(id),
    onSuccess: async () => {
      setDeleteOpen(false)
      toast.show('Bill deleted.')
      navigate('/bills')
      await invalidate()
    },
    onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
  })
  useDocumentTitle(bill.data?.title ?? 'Bill')

  if (bill.isPending) return <Loading label="Loading bill…" />
  if (bill.isError) {
    if (bill.error instanceof ApiError && bill.error.status === 404) {
      return (
        <EmptyState title="Bill not found" action={<Link to="/bills" className="btn btn-secondary">Back to bills</Link>}>
          It may have been deleted, or the link is from another household.
        </EmptyState>
      )
    }
    return <ErrorNotice error={bill.error} onRetry={() => bill.refetch()} />
  }

  const b = bill.data
  const latestFirst = b.documents

  function onFile(file: File) {
    setUploadError(null)
    upload.mutate({ billId: id, file }, {
      onSuccess: (document) => toast.show(`Statement saved as version ${document.versionNumber}.`),
      onError: (error) => setUploadError(errorMessage(error)),
    })
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/bills">Bills</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{b.title}</span>
      </nav>

      <header className="bill-header">
        <div>
          <p className="eyebrow">{b.provider.name} · {b.category.name}</p>
          <h1>{b.title}</h1>
          <div className="bill-status-line">
            <StatusLabel status={b.status} />
            <span>Due {formatDate(b.dueDate)}</span>
            <DueHint status={b.status} daysUntilDue={b.daysUntilDue} paidDate={b.paidDate} />
          </div>
        </div>
        <p className="bill-amount" data-testid="bill-amount">
          <MoneyFigure amount={b.amount} currency={b.currency} />
        </p>
        <div className="bill-actions btn-row">
          {b.status === 'PAID' ? (
            <button type="button" className="btn btn-secondary" disabled={markUnpaid.isPending}
              onClick={() => markUnpaid.mutate(id, {
                onSuccess: () => toast.show('Payment removed; the bill is unpaid again.'),
                onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
              })}>
              Mark unpaid
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setPayOpen(true)}>
              <Icon name="check" />Mark paid
            </button>
          )}
          <Link to={`/bills/${id}/edit`} className="btn btn-secondary">Edit</Link>
          <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" />Delete
          </button>
        </div>
      </header>

      <div className="split collapse-md">
        <section className="span-7" aria-labelledby="statements-heading">
          <div className="section-head">
            <div>
              <h2 id="statements-heading">Statements</h2>
              <p>
                {latestFirst.length === 0
                  ? 'No statement uploaded yet.'
                  : `${plural(latestFirst.length, 'version')} kept, newest first. Earlier versions stay retrievable.`}
              </p>
            </div>
          </div>
          <StatementDropzone
            title={latestFirst.length ? 'Upload a new version' : 'Upload statement'}
            hint={latestFirst.length
              ? 'A corrected or reissued statement becomes the next version; nothing is overwritten. PDF, JPG or PNG, up to 10 MB.'
              : undefined}
            busy={upload.isPending}
            error={uploadError}
            onFile={onFile}
          />
          {latestFirst.length > 0 && (
            <ol className="timeline" aria-label="Statement versions">
              {latestFirst.map((document) => (
                <li key={document.id} className={`timeline-item ${document.latest ? 'latest' : ''}`}>
                  <span className="timeline-node" aria-hidden="true" />
                  <div>
                    <div className="timeline-title">
                      <span className="version">Version {document.versionNumber}</span>
                      {document.latest && <span className="tag tag-accent">Latest</span>}
                      <span className="tag">{fileKind(document.contentType)}</span>
                    </div>
                    <p className="timeline-file">{document.filename}</p>
                    <p className="timeline-meta">
                      Uploaded {formatDateTime(document.uploadedAt, household.timezone)} · {fileSize(document.sizeBytes)}
                    </p>
                    <div className="timeline-actions">
                      <button type="button" className="btn btn-text"
                        aria-label={`Preview version ${document.versionNumber}`}
                        onClick={() => viewer.preview(document)}>
                        <Icon name="eye" />Preview
                      </button>
                      <button type="button" className="btn btn-text"
                        aria-label={`Download version ${document.versionNumber}`}
                        onClick={() => viewer.download(document)}>
                        <Icon name="download" />Download
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="span-5 divided-left" aria-labelledby="details-heading">
          <h2 id="details-heading" className="h3" style={{ marginBottom: '0.9rem' }}>Details</h2>
          <dl className="facts">
            <dt>Amount</dt>
            <dd className="num">{money(b.amount, b.currency)}</dd>
            <dt>Due date</dt>
            <dd>{formatDate(b.dueDate)}</dd>
            <dt>Paid on</dt>
            <dd>{b.paidDate ? formatDate(b.paidDate) : <span className="muted">Not paid yet</span>}</dd>
            <dt>Provider</dt>
            <dd>{b.provider.name}</dd>
            <dt>Category</dt>
            <dd>{b.category.name}</dd>
            <dt>Reminder</dt>
            <dd>{b.reminderLeadDays === 0 ? 'On the due date' : `${plural(b.reminderLeadDays, 'day')} before it is due`}</dd>
            <dt>Recurring</dt>
            <dd>{b.schedule ? <Link to={`/recurring/${b.schedule.id}`}>{b.schedule.name}</Link> : 'One-off bill'}</dd>
            <dt>Notes</dt>
            <dd>{b.notes ?? <span className="muted">None</span>}</dd>
            <dt>Added</dt>
            <dd>{formatDateTime(b.createdAt, household.timezone)}</dd>
          </dl>
        </section>
      </div>

      <MarkPaidDialog open={payOpen} bill={b} onClose={() => setPayOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this bill?"
        confirmLabel="Delete bill"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleteOpen(false)}
      >
        <p>
          <strong>{b.title}</strong> will be removed for good
          {b.documents.length > 0 ? `, together with its ${plural(b.documents.length, 'statement version')}` : ''}.
          Reminders for it are removed too.
        </p>
        {b.schedule && (
          <p className="small muted">The recurring schedule stays, and it won&rsquo;t recreate this bill.</p>
        )}
      </ConfirmDialog>
      {viewer.dialog}
    </>
  )
}
