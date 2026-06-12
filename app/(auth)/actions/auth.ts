import type { RegisterInput } from '@/app/(auth)/models/user'
import { executeRequest } from '@/app/actions/api'
import type { ApiResult } from '@/app/models/api'

/** Client-side auth actions: thin wrappers around the REST API. */

export type ActionResult = ApiResult
export type { RegisterInput }

/** Creates a new user with email/password credentials. */
export async function registerUser(input: RegisterInput): Promise<ActionResult> {
  return executeRequest<ActionResult>('/users', { method: 'POST', body: JSON.stringify(input) })
}
