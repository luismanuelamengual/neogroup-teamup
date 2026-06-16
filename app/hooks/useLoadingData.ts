import { DependencyList, useEffect, useRef, useState } from 'react'

export function useLoadingData<T>(
  callback: () => Promise<T>,
  deps: DependencyList,
  defaultValue: T = undefined as T
): { data: T; loading: boolean; error: Error | null } {
  const [loading, setLoading] = useState<boolean>(true)
  const [data, setData] = useState<T>(defaultValue)
  const [error, setError] = useState<Error | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    let isMounted = true

    setLoading(true)
    setError(null)

    callbackRef
      .current()
      .then((newData) => {
        if (isMounted) {
          if (newData !== undefined) {
            setData(newData)
          }

          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
