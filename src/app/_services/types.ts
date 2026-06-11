/** Shared result type returned by server-side services and API endpoints. */
export interface ServiceResult {
  success: boolean
  error?: string
  id?: number
}
