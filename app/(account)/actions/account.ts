import type { AccountInput } from '@/app/(account)/models/account'
import type { UserRoleId } from '@/app/(auth)/models/user'
import { executeRequest } from '@/app/actions/api'

/** Client-side account actions: thin wrappers around the REST API. */

export type { AccountInput }

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
