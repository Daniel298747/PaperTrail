import { useEffect, useRef, useState } from 'react'
import type { SetURLSearchParams } from 'react-router'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * Mirrors a debounced search box into one URL parameter. Only changes to the typed text are
 * written, so clearing other filters never resurrects an old search term.
 */
export function useSearchParamSync(text: string, name: string, setParams: SetURLSearchParams) {
  const debounced = useDebouncedValue(text.trim(), 300)
  const lastApplied = useRef(debounced)
  useEffect(() => {
    if (debounced === lastApplied.current) return
    lastApplied.current = debounced
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (debounced) next.set(name, debounced)
      else next.delete(name)
      next.delete('page')
      return next
    }, { replace: true })
  }, [debounced, name, setParams])
}
