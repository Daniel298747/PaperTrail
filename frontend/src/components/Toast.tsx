import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { ToastContext, type ToastAction, type ToastApi } from './useToast'

interface Toast {
  id: number
  message: string
  tone: 'default' | 'error'
  action?: ToastAction
}

/** Short confirmations ("Marked paid") announced politely; errors and undo offers stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    const id = nextId.current++
    const toast: Toast = { id, message, tone: options.tone ?? 'default', action: options.action }
    setToasts((current) => [...current.slice(-2), toast])
    window.setTimeout(() => dismiss(id), toast.action || toast.tone === 'error' ? 8000 : 4500)
  }, [dismiss])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone === 'error' ? 'error' : ''}`} role="status">
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button type="button" onClick={() => {
                toast.action?.onClick()
                dismiss(toast.id)
              }}>
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
