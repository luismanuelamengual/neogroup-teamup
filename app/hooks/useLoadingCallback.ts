import { DependencyList, useCallback, useEffect, useRef, useState } from 'react'

type AsyncCallback<Args extends any[], Return> = (...args: Args) => Promise<Return>

export function useLoadingCallback<Args extends any[], Return>(
  callback: AsyncCallback<Args, Return>,
  deps: DependencyList
): [AsyncCallback<Args, Return | undefined>, boolean, Error | null] {
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const run = useCallback(async (...args: Args): Promise<Return | undefined> => {
    setLoading(true)
    setError(null)

    try {
      const result = await callbackRef.current(...args)

      if (isMountedRef.current) {
        setLoading(false)
      }

      return result
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }

      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return [run, loading, error]
}
