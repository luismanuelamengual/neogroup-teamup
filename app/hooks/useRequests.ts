import { useCallback } from 'react'
import { ApiResponse } from '../models/ApiResponse'
import { useNotifications } from './useNotifications'

export function useRequests() {
  const { showErrorMessage } = useNotifications()
  const executeRequest = useCallback(
    async <T>(url: string, payload: unknown = {}, notifyError = true): Promise<T> => {
      const response = await fetch(`/api${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = (await response.json()) as ApiResponse<T>

      if (!result.success) {
        const error = new Error(result.error?.message ?? 'internalError')

        if (notifyError) {
          showErrorMessage(error.message)
        }

        throw error
      }

      return result.data as T
    },
    [showErrorMessage]
  )

  return executeRequest
}
