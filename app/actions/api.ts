import { ApiResponse } from '@/app/models/ApiResponse'
import { showErrorMessage } from './notifications'

/**
 * Calls a REST API endpoint. Every endpoint of the app is a POST with a JSON
 * payload and answers the standard ApiResponse shape: this helper returns the
 * `data` of a successful response (cast to T) or throws an Error whose
 * message is the stable error code of the failed response.
 */
export async function executeRequest<T = void>(url: string, payload: unknown = {}, notifyError = true): Promise<T> {
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
}
