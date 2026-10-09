import { useMarkPaid, useMarkUnpaid } from '../api/queries'
import { errorMessage } from '../lib/forms'
import { useToast } from './useToast'

/** One-click "Mark paid" (dated today in the household timezone) with an Undo in the confirmation. */
export function usePayBill() {
  const markPaid = useMarkPaid()
  const markUnpaid = useMarkUnpaid()
  const toast = useToast()

  function pay(bill: { id: string; title: string }) {
    markPaid.mutate({ id: bill.id }, {
      onSuccess: () => toast.show(`Marked paid: ${bill.title}`, {
        action: {
          label: 'Undo',
          onClick: () => markUnpaid.mutate(bill.id, {
            onSuccess: () => toast.show(`Payment removed: ${bill.title}`),
            onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
          }),
        },
      }),
      onError: (error) => toast.show(errorMessage(error), { tone: 'error' }),
    })
  }

  const pendingId = markPaid.isPending ? markPaid.variables?.id : undefined
  return { pay, pendingId }
}
