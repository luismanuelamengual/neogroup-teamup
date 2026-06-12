/**
 * Types shared by every API route handler (server) and action (client):
 * the common result shape returned by the REST endpoints.
 */

/** Shared result type returned by the API endpoints. */
export interface ApiResult {
  success: boolean
  error?: string
  id?: number
}
