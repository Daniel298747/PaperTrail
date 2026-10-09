import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastApi {
  show: (message: string, options?: { tone?: 'default' | 'error'; action?: ToastAction }) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
