import type { UserRoleId } from '@/app/(auth)/models/UserRoles'
import { executeRequest } from '@/app/actions/api'

/** Client-side account actions: thin wrappers around the REST API. */

/** Payload to update the personal information of the signed-in user. */
export interface AccountInput {
  firstName: string
  lastName: string
  nickname: string
}

/** Updates the personal information of the signed-in user. */
export async function updateAccount(input: AccountInput): Promise<void> {
  await executeRequest('/account/update', input)
}

/** Assigns the user role once (first login without a role). It cannot be changed afterwards. */
export async function setRole(roleId: UserRoleId): Promise<void> {
  await executeRequest('/account/role', { roleId })
}

/** Changes the interface language (stored in a cookie). */
export async function setLocale(locale: string): Promise<void> {
  await executeRequest('/account/locale', { locale })
}
