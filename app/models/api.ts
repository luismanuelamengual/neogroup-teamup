/**
 * Standard response shape shared by every API endpoint (server) and by
 * executeRequest (client). Every endpoint responds:
 * - success: { success: true, data: ... }
 * - error:   { success: false, errorMessage: ..., error: ... }
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  errorMessage?: string
  error?: Error
}
