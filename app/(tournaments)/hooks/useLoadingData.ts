import { DependencyList, useCallback, useEffect, useState } from 'react'

export function useLoadingData<T>(
  callback: () => Promise<T>,
  deps: DependencyList,
  defaultValue: T = undefined as T
): [T, boolean] {
  const [loading, setLoading] = useState<boolean>(true)
  const [data, setData] = useState<T>(defaultValue)
  const updateData = useCallback(async () => {
    setLoading(true)

    try {
      const newData = await callback()

      if (newData !== undefined) {
        setData(newData)
      }
    } catch (e) {}

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    updateData()
  }, [updateData])

  return [data, loading]
}
