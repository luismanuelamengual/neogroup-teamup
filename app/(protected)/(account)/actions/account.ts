import type { Role } from '@/app/(auth)/models/Role'
import { executeRequest } from '@/app/actions/api'

/** Client-side account actions: thin wrappers around the REST API. */

/** Payload to update the personal information of the signed-in user. */
export interface AccountInput {
  firstName: string
  lastName: string
  nickname: string
  phoneNumber?: string
}

/** Updates the personal information of the signed-in user. */
export async function updateAccount(input: AccountInput): Promise<void> {
  await executeRequest('/updateAccount', input)
}

/** Assigns the user role once (first login without a role). It cannot be changed afterwards. */
export async function setRole(roleId: Role): Promise<void> {
  await executeRequest('/updateAccount', { roleId })
}

/** Changes the interface language (stored in a cookie). */
export async function setLocale(locale: string): Promise<void> {
  await executeRequest('/updateAccount', { locale })
}
