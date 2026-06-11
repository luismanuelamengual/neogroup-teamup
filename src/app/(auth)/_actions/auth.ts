import { executeRequest } from '@/app/_actions/api'
import type { ApiResult, RegisterInput } from '@/app/_models/api'

/** Client-side auth actions: thin wrappers around the REST API. */

export type ActionResult = ApiResult
export type { RegisterInput }

/** Creates a new user with email/password credentials. */
export async function registerUser(input: RegisterInput): Promise<ActionResult> {
  return executeRequest<ActionResult>('/users', { method: 'POST', body: JSON.stringify(input) })
}
