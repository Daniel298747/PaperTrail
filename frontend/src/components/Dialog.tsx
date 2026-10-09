import { useEffect, useId, useRef, type ReactNode } from 'react'

import { Icon } from './Icon'

/** Native <dialog>: modal focus trapping, Escape to close, and focus return come from the browser. */
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose()
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy, destructive, onConfirm, onClose }: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${destructive ? 'btn-danger-solid' : 'btn-primary'}`}
            onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
