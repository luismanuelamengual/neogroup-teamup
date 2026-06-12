import type { RegisterInput } from '@/app/(auth)/models/user'
import { executeRequest } from '@/app/actions/api'

/** Client-side auth actions: thin wrappers around the REST API. */

export type { RegisterInput }

/** Creates a new user with email/password credentials. Returns the new user id. */
export async function registerUser(input: RegisterInput): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/users/register', input)
}
