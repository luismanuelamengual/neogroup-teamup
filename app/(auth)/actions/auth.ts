import type { UserRoleId } from '@/app/(auth)/models/UserRoles'
import { executeRequest } from '@/app/actions/api'

/** Client-side auth actions: thin wrappers around the REST API. */

/** Payload to create a new user with email/password credentials. */
export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  roleId: UserRoleId
}

/** Creates a new user with email/password credentials. Returns the new user id. */
export async function registerUser(input: RegisterInput): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/users/register', input)
}
