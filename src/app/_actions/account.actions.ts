import type { Profile } from '@/app/_models/types'
import type { AccountInput } from '@/app/_services/account.service'
import type { ServiceResult } from '@/app/_services/types'
import { apiRequest } from '@/app/_utils/api-client'

/**
 * Client-side account actions: thin wrappers around the REST API
 * (plus any data massaging needed by the views).
 */

export type ActionResult = ServiceResult
export type { AccountInput }

/** Updates the personal information of the signed-in user. */
export async function updateAccount(input: AccountInput): Promise<ActionResult> {
  return apiRequest<ActionResult>('/api/account', { method: 'PATCH', body: JSON.stringify(input) })
}

/** Sets the active profile (organizer / player) for the signed-in user. */
export async function setProfile(profile: Profile): Promise<ActionResult> {
  return apiRequest<ActionResult>('/api/account/profile', { method: 'PUT', body: JSON.stringify({ profile }) })
}

/** Changes the interface language (stored in a cookie). */
export async function setLocale(locale: string): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/account/locale', {
    method: 'PUT',
    body: JSON.stringify({ locale })
  })
}
