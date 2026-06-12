/**
 * Standard response shape shared by every API endpoint (server) and by
 * executeRequest (client). Every endpoint responds:
 * - success: { success: true, data: ... }
 * - error:   { success: false, error: ... } (error.message is a stable code
 *   the FE can map to a translation)
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: Error
}
