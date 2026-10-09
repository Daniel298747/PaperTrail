import { createContext, useContext } from 'react'

import type { Account } from '../api/types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; reason?: 'expired' | 'signed-out' }
  | { status: 'authenticated'; account: Account }

export interface RegisterInput {
  email: string
  password: string
  displayName: string
  timezone: string
  currency: string
}

export interface AuthContextValue {
  state: AuthState
  account: Account | null
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  setAccount: (account: Account) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** The signed-in household. Only call inside routes guarded by RequireAuth. */
export function useHousehold(): Account {
  const { account } = useAuth()
  if (!account) throw new Error('useHousehold called without an authenticated session')
  return account
}
