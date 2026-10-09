import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { Loading } from '../components/ui'
import { useAuth } from './useAuth'

export interface AuthRedirectState {
  from?: string
  reason?: 'expired' | 'signed-out'
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') {
    return <div className="main"><Loading label="Opening your ledger…" /></div>
  }
  if (state.status === 'anonymous') {
    const redirect: AuthRedirectState = { from: location.pathname + location.search, reason: state.reason }
    return <Navigate to="/login" replace state={redirect} />
  }
  return <>{children}</>
}

/** Sign-in and registration pages bounce signed-in users back to where they were going. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') {
    return <div className="main"><Loading label="Checking your session…" /></div>
  }
  if (state.status === 'authenticated') {
    const from = (location.state as AuthRedirectState | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }
  return <>{children}</>
}
