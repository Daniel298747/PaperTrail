// HTTP plumbing for the demo API: problem+json errors with the same codes and messages as the Spring
// backend (ApiException / ApiExceptionHandler), request body readers and query parameter parsing.

import { isIsoDate, isYearMonth } from './dates'
import { UUID_PATTERN } from './util'

export interface FieldViolation {
  field: string
  message: string
}

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  502: 'Bad Gateway',
  500: 'Internal Server Error',
}

export class Problem extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>
  readonly errors: FieldViolation[]

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {},
    errors: FieldViolation[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.errors = errors
  }

  toResponse(instance: string): Response {
    const body = {
      type: 'about:blank',
      title: REASONS[this.status] ?? 'Error',
      status: this.status,
      detail: this.message,
      instance,
      code: this.code,
      ...this.details,
      ...(this.errors.length > 0 ? { errors: this.errors } : {}),
    }
    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: { 'Content-Type': 'application/problem+json' },
    })
  }
}

export const notFound = (resource: string) => new Problem(404, 'not_found', `${resource} not found.`)

export const conflict = (code: string, message: string, details: Record<string, unknown> = {}) =>
  new Problem(409, code, message, details)

export const badRequest = (code: string, message: string) => new Problem(400, code, message)

export const unauthorized = (code: string, message: string) => new Problem(401, code, message)

export const invalidField = (field: string, message: string) =>
  new Problem(400, 'validation_failed', 'Some fields need attention.', {}, [{ field, message }])

export const malformed = () =>
  badRequest('malformed_request', 'The request body is missing or has a value in the wrong format.')

export const invalidParameter = (name: string) => badRequest('invalid_parameter', `'${name}' has an invalid value.`)

/** Collects bean-validation style violations so every failing field is reported at once. */
export class Violations {
  private readonly list: FieldViolation[] = []

  add(field: string, message: string) {
    this.list.push({ field, message })
  }

  throwIfAny() {
    if (this.list.length > 0) {
      throw new Problem(400, 'validation_failed', 'Some fields need attention.', {}, this.list)
    }
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const noContent = () => new Response(null, { status: 204 })

export type Body = Record<string, unknown>

/** Parses a JSON object body. An optional body may be absent or null. */
export function readJson(init: RequestInit, required = true): Body {
  const raw = init.body
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw malformed()
    return {}
  }
  if (typeof raw !== 'string') throw malformed()
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw malformed()
  }
  if (value === null && !required) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw malformed()
  return value as Body
}

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/

/** Typed field readers; a value of the wrong JSON type is a malformed request, as Jackson would report. */
export const read = {
  string(body: Body, key: string): string | null {
    const value = body[key]
    if (value === undefined || value === null) return null
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    throw malformed()
  },
  uuid(body: Body, key: string): string | null {
    const value = body[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'string' && UUID_PATTERN.test(value)) return value.toLowerCase()
    throw malformed()
  },
  date(body: Body, key: string): string | null {
    const value = body[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'string' && isIsoDate(value)) return value
    throw malformed()
  },
  int(body: Body, key: string): number | null {
    const value = body[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
    if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return Number(value.trim())
    throw malformed()
  },
  decimal(body: Body, key: string): string | null {
    const value = body[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'string' && DECIMAL.test(value.trim())) return value.trim()
    throw malformed()
  },
  enumOf<T extends string>(body: Body, key: string, values: readonly T[]): T | null {
    const value = body[key]
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'string' && (values as readonly string[]).includes(value)) return value as T
    throw malformed()
  },
  bool(body: Body, key: string): boolean | null {
    const value = body[key]
    if (value === undefined || value === null) return null
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === 'false') return value === 'true'
    throw malformed()
  },
}

/**
 * Validates a money amount (@NotNull, @DecimalMin("0.00"), @Digits(integer = 10, fraction = 2)) and
 * returns it in cents, or undefined when a violation was recorded.
 */
export function amountCents(violations: Violations, field: string, raw: string | null,
  requiredMessage: string): number | undefined {
  if (raw === null) {
    violations.add(field, requiredMessage)
    return undefined
  }
  const negative = raw.startsWith('-')
  const [whole = '', fraction = ''] = raw.replace(/^[+-]/, '').split('.')
  const integerDigits = whole.replace(/^0+/, '')
  const fractionDigits = fraction.replace(/0+$/, '')
  const isZero = integerDigits === '' && fractionDigits === ''
  let valid = true
  if (negative && !isZero) {
    violations.add(field, "The amount can't be negative.")
    valid = false
  }
  if (integerDigits.length > 10 || fractionDigits.length > 2) {
    violations.add(field, 'Use at most two decimal places.')
    valid = false
  }
  if (!valid) return undefined
  return Number(integerDigits || '0') * 100 + Number(fractionDigits.padEnd(2, '0'))
}

/** Query string readers with Spring's conversion rules: a bad value is a 400 invalid_parameter. */
export class Query {
  private readonly params: URLSearchParams

  constructor(params: URLSearchParams) {
    this.params = params
  }

  string(name: string): string | null {
    const value = this.params.get(name)
    return value === null || value === '' ? null : value
  }

  uuid(name: string): string | null {
    const value = this.string(name)
    if (value === null) return null
    if (!UUID_PATTERN.test(value)) throw invalidParameter(name)
    return value.toLowerCase()
  }

  int(name: string, fallback: number): number {
    const value = this.string(name)
    if (value === null) return fallback
    if (!/^[+-]?\d+$/.test(value)) throw invalidParameter(name)
    return Number(value)
  }

  bool(name: string, fallback: boolean): boolean {
    const value = this.string(name)?.toLowerCase()
    if (value === undefined) return fallback
    if (['true', 'on', 'yes', '1'].includes(value)) return true
    if (['false', 'off', 'no', '0'].includes(value)) return false
    throw invalidParameter(name)
  }

  date(name: string): string | null {
    const value = this.string(name)
    if (value === null) return null
    if (!isIsoDate(value)) throw invalidParameter(name)
    return value
  }

  yearMonth(name: string): string | null {
    const value = this.string(name)
    if (value === null) return null
    if (!isYearMonth(value)) throw invalidParameter(name)
    return value
  }
}

/** Spring's PageRequest bounds: page >= 0 and 1 <= size <= 100. */
export function paginate<T>(items: T[], page: number, size: number) {
  const safePage = Math.max(page, 0)
  const safeSize = Math.min(Math.max(size, 1), 100)
  return {
    content: items.slice(safePage * safeSize, safePage * safeSize + safeSize),
    page: safePage,
    size: safeSize,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / safeSize),
  }
}

export type Comparator<T> = (a: T, b: T) => number

/**
 * Parses "field,direction" against a whitelist (SortParser). Null values sort as PostgreSQL does:
 * last when ascending, first when descending.
 */
export function parseSort<T>(value: string | null, allowed: Record<string, (item: T) => string | number | null>,
  fallback: string): Comparator<T> {
  const [rawField, rawDirection] = (value && value.trim() ? value : fallback).split(',', 2)
  const field = rawField.trim()
  const key = Object.hasOwn(allowed, field) ? allowed[field] : undefined
  if (!key) throw badRequest('invalid_sort', `Sorting by '${field}' isn't supported.`)
  const direction = rawDirection?.trim().toLowerCase() === 'desc' ? -1 : 1
  return (a, b) => direction * compareValues(key(a), key(b))
}

export function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function thenBy<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const comparator of comparators) {
      const result = comparator(a, b)
      if (result !== 0) return result
    }
    return 0
  }
}
