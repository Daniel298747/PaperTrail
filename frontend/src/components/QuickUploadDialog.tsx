import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { billsApi } from '../api/endpoints'
import { keys, useUploadDocument } from '../api/queries'
import type { BillQuery } from '../api/types'
import { formatShortDate, money } from '../lib/format'
import { Dialog } from './Dialog'
import { Field, FieldError } from './ui'
import { ACCEPT_ATTRIBUTE, checkStatementFile } from '../lib/statements'
import { useToast } from './useToast'
import { errorMessage, fieldAria } from '../lib/forms'

const OUTSTANDING: BillQuery = { status: 'outstanding', sort: 'dueDate,asc', size: 100 }
const RECENTLY_PAID: BillQuery = { status: 'paid', sort: 'dueDate,desc', size: 20 }

/** "Upload statement" from anywhere: pick the bill, pick the file. */
export function QuickUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const outstanding = useQuery({ queryKey: keys.billList(OUTSTANDING), queryFn: () => billsApi.list(OUTSTANDING), enabled: open })
  const paid = useQuery({ queryKey: keys.billList(RECENTLY_PAID), queryFn: () => billsApi.list(RECENTLY_PAID), enabled: open })
  const upload = useUploadDocument()
  const [billId, setBillId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setBillId('')
    setFile(null)
    setError(null)
    onClose()
  }

  function submit() {
    if (!billId) return setError('Choose the bill this statement belongs to.')
    if (!file) return setError('Choose a file to upload.')
    const problem = checkStatementFile(file)
    if (problem) return setError(problem)
    setError(null)
    upload.mutate({ billId, file }, {
      onSuccess: (document) => {
        const target = billId
        toast.show(`Statement saved as version ${document.versionNumber}.`, {
          action: { label: 'Open bill', onClick: () => navigate(`/bills/${target}`) },
        })
        close()
      },
      onError: (cause) => setError(errorMessage(cause)),
    })
  }

  const loading = outstanding.isPending || paid.isPending

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload statement"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      <p className="secondary">
        Attach a PDF, JPG or PNG to one of your bills. Uploading to the same bill later adds a new version and keeps this one.
      </p>
      <Field label="Bill" htmlFor="quick-bill">
        <select
          className="select"
          value={billId}
          onChange={(event) => setBillId(event.target.value)}
          disabled={loading}
          {...fieldAria('quick-bill')}
        >
          <option value="">{loading ? 'Loading bills…' : 'Choose a bill'}</option>
          {outstanding.data && outstanding.data.content.length > 0 && (
            <optgroup label="Outstanding">
              {outstanding.data.content.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.title} · {bill.provider.name} · due {formatShortDate(bill.dueDate)} · {money(bill.amount, bill.currency)}
                </option>
              ))}
            </optgroup>
          )}
          {paid.data && paid.data.content.length > 0 && (
            <optgroup label="Recently paid">
              {paid.data.content.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.title} · {bill.provider.name} · {formatShortDate(bill.dueDate)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>
      <Field label="File" htmlFor="quick-file" help="PDF, JPG or PNG, up to 10 MB.">
        <input
          className="input"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          {...fieldAria('quick-file', undefined, true)}
        />
      </Field>
      <FieldError message={error ?? undefined} />
      <p className="small muted">
        Bill not listed? <Link to="/bills/new" onClick={close}>Add the bill first</Link>.
      </p>
    </Dialog>
  )
}
