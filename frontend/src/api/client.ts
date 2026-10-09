import type { AuthResponse } from './types'

/**
 * HTTP client.
 *
 * - The access token lives only in memory (never localStorage).
 * - The refresh token is an HttpOnly cookie the browser sends to /api/auth/* only.
 * - Cookie-authenticated calls (/api/auth/*) carry a CSRF token fetched from /api/auth/csrf.
 * - A 401 on a normal call triggers one silent refresh (shared by concurrent callers), then one retry.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** Demo builds (GitHub Pages) answer every call with the in-browser API in src/demo instead of a server. */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export interface FieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: FieldError[]
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = [],
    details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.details = details
  }
}

let accessToken: string | null = null
let csrf: { headerName: string; token: string } | null = null
let refreshInFlight: Promise<AuthResponse | null> | null = null
let sessionExpiredHandler: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function onSessionExpired(handler: (() => void) | null) {
  sessionExpiredHandler = handler
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {}
  try {
    body = await response.json()
  } catch {
    // Non-JSON error bodies (e.g. a proxy's HTML page) fall through to a generic message.
  }
  const { detail, code, errors, type: _type, title: _title, status: _status, instance: _instance, ...rest } = body
  const message = typeof detail === 'string' && detail ? detail : fallbackMessage(response.status)
  return new ApiError(response.status, typeof code === 'string' ? code : 'error', message,
    Array.isArray(errors) ? (errors as FieldError[]) : [], rest)
}

function fallbackMessage(status: number): string {
  if (status === 0) return 'The server could not be reached. Check your connection and try again.'
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.'
  if (status === 404) return 'That record could not be found.'
  return 'The request could not be completed.'
}

async function send(input: string, init: RequestInit): Promise<Response> {
  try {
    if (DEMO_MODE) {
      const { handle } = await import('../demo/server')
      return await handle(input, init)
    }
    return await fetch(API_BASE + input, init)
  } catch {
    throw new ApiError(0, 'network_error', fallbackMessage(0))
  }
}

async function csrfToken(force = false) {
  if (!csrf || force) {
    const response = await send('/api/auth/csrf', { credentials: 'include' })
    if (!response.ok) throw await toApiError(response)
    csrf = await response.json()
  }
  return csrf!
}

/** POST to a cookie-authenticated /api/auth endpoint with CSRF protection (one retry on a stale token). */
export async function authPost<T>(path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await csrfToken(attempt > 0)
    const response = await send(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        [token.headerName]: token.token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.ok) {
      return (response.status === 204 ? undefined : await response.json()) as T
    }
    const error = await toApiError(response)
    if (error.code === 'csrf_invalid' && attempt === 0) continue
    throw error
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Exchanges the refresh cookie for a new access token. Resolves null when there is no valid session
 * (the API answers 204 when no refresh cookie exists at all).
 */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const result = await authPost<AuthResponse | undefined>('/api/auth/refresh')
        accessToken = result?.accessToken ?? null
        return result ?? null
      } catch (error) {
        // Another tab rotated the cookie a moment ago: retry once with the cookie it left behind.
        if (error instanceof ApiError && error.code === 'session_superseded') {
          await sleep(400)
          try {
            const result = await authPost<AuthResponse | undefined>('/api/auth/refresh')
            accessToken = result?.accessToken ?? null
            return result ?? null
          } catch {
            // fall through
          }
        }
        accessToken = null
        return null
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit }

/** Authenticated API call with silent refresh. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options
  const perform = () => send(path, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : options.body,
  })

  let response = await perform()
  if (response.status === 401) {
    const refreshed = await refreshSession()
    if (!refreshed) {
      sessionExpiredHandler?.()
      throw await toApiError(response)
    }
    response = await perform()
  }
  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Builds a query string, dropping empty values. */
export function query(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
