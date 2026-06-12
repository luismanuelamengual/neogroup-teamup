import type { AccountInput } from '@/app/(account)/models/account'
import type { Profile } from '@/app/(auth)/models/user'
import { executeRequest } from '@/app/actions/api'
import type { ApiResult } from '@/app/models/api'

/**
 * Client-side account actions: thin wrappers around the REST API
 * (plus any data massaging needed by the views).
 */

export type ActionResult = ApiResult
export type { AccountInput }

/** Updates the personal information of the signed-in user. */
export async function updateAccount(input: AccountInput): Promise<ActionResult> {
  return executeRequest<ActionResult>('/account', { method: 'PATCH', body: JSON.stringify(input) })
}

/** Sets the active profile (organizer / player) for the signed-in user. */
export async function setProfile(profile: Profile): Promise<ActionResult> {
  return executeRequest<ActionResult>('/account/profile', { method: 'PUT', body: JSON.stringify({ profile }) })
}

/** Changes the interface language (stored in a cookie). */
export async function setLocale(locale: string): Promise<void> {
  await executeRequest<{ success: boolean }>('/account/locale', {
    method: 'PUT',
    body: JSON.stringify({ locale })
  })
}
