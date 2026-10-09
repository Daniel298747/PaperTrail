import { ApiError } from '../api/client'

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string, hasHelp = false) {
  const describedBy = error ? `${id}-error` : hasHelp ? `${id}-help` : undefined
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const
}

/** Applies server-side field errors to a react-hook-form instance; returns true if any were applied. */
export function applyFieldErrors(
  error: unknown,
  setError: (name: never, value: { type: string; message: string }) => void,
  fields: readonly string[],
): boolean {
  if (!(error instanceof ApiError) || error.fieldErrors.length === 0) return false
  let applied = false
  for (const fieldError of error.fieldErrors) {
    if (fields.includes(fieldError.field)) {
      setError(fieldError.field as never, { type: 'server', message: fieldError.message })
      applied = true
    }
  }
  return applied
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Try again.'
}
