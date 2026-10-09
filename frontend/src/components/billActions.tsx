import { useState } from 'react'

import { useMarkPaid } from '../api/queries'
import { useHousehold } from '../auth/useAuth'
import { errorMessage, fieldAria } from '../lib/forms'
import { Dialog } from './Dialog'
import { Field } from './ui'
import { useToast } from './useToast'

/** Payment with an explicit date (bill detail page). */
export function MarkPaidDialog({ open, bill, onClose }: {
  open: boolean
  bill: { id: string; title: string }
  onClose: () => void
}) {
  const household = useHousehold()
  const markPaid = useMarkPaid()
  const toast = useToast()
  const [paidDate, setPaidDate] = useState(household.today)
  const [error, setError] = useState<string | undefined>()

  function submit() {
    if (!paidDate) {
      setError('Choose the date you paid.')
      return
    }
    if (paidDate > household.today) {
      setError("The payment date can't be in the future.")
      return
    }
    setError(undefined)
    markPaid.mutate({ id: bill.id, paidDate }, {
      onSuccess: () => {
        toast.show(`Marked paid: ${bill.title}`)
        onClose()
      },
      onError: (cause) => setError(errorMessage(cause)),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark as paid"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Saving…' : 'Mark paid'}
          </button>
        </>
      }
    >
      <p className="secondary">Record the payment for <strong>{bill.title}</strong>. Outstanding totals update straight away.</p>
      <Field label="Payment date" htmlFor="paid-date" error={error}>
        <input
          className="input"
          type="date"
          max={household.today}
          value={paidDate}
          onChange={(event) => setPaidDate(event.target.value)}
          {...fieldAria('paid-date', error)}
        />
      </Field>
    </Dialog>
  )
}
