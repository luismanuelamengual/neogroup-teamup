'use client'

import { useEffect, useState } from 'react'

/** Returns the given value after it has been stable for `delay` milliseconds. */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timeout)
  }, [value, delay])

  return debounced
}
