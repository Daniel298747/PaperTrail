import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { authPost, onSessionExpired, refreshSession, setAccessToken } from '../api/client'
import type { Account, AuthResponse } from '../api/types'
import { AuthContext, type AuthContextValue, type AuthState, type RegisterInput } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const accept = useCallback((response: AuthResponse) => {
    setAccessToken(response.accessToken)
    setState({ status: 'authenticated', account: response.account })
  }, [])

  // Restore the session on page load: the HttpOnly refresh cookie is the only thing that survives a reload.
  useEffect(() => {
    let active = true
    void refreshSession().then((result) => {
      if (!active) return
      setState(result ? { status: 'authenticated', account: result.account } : { status: 'anonymous' })
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    onSessionExpired(() => {
      setAccessToken(null)
      queryClient.clear()
      setState({ status: 'anonymous', reason: 'expired' })
    })
    return () => onSessionExpired(null)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const response = await authPost<AuthResponse>('/api/auth/login', { email, password })
    queryClient.clear()
    accept(response)
  }, [accept, queryClient])

  const register = useCallback(async (input: RegisterInput) => {
    const response = await authPost<AuthResponse>('/api/auth/register', input)
    queryClient.clear()
    accept(response)
  }, [accept, queryClient])

  const logout = useCallback(async () => {
    try {
      await authPost<void>('/api/auth/logout')
    } catch {
      // The session may already be gone; signing out locally is still correct.
    }
    setAccessToken(null)
    queryClient.clear()
    setState({ status: 'anonymous', reason: 'signed-out' })
  }, [queryClient])

  const setAccount = useCallback((account: Account) => {
    setState((current) => (current.status === 'authenticated' ? { status: 'authenticated', account } : current))
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    state,
    account: state.status === 'authenticated' ? state.account : null,
    login,
    register,
    logout,
    setAccount,
  }), [state, login, register, logout, setAccount])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
