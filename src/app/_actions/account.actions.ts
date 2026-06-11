'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { Profile } from '@/app/_models/types'
import { User } from '@/app/_models/User'
import { auth, unstable_update } from '@/auth'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, SupportedLocale } from '@/i18n/request'

export interface AccountInput {
  firstName: string
  lastName: string
  nickname: string
}

export interface ActionResult {
  success: boolean
  error?: string
}

async function requireUserId(): Promise<number | null> {
  const session = await auth()

  return session?.user?.id ? Number(session.user.id) : null
}

/** Updates the personal information of the signed-in user. */
export async function updateAccount(input: AccountInput): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    return { success: false, error: 'missingFields' }
  }

  const user = await User.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nickname = input.nickname.trim() || null
  await user.save()
  await unstable_update({})

  return { success: true }
}

/** Sets the active profile (organizer / player) for the signed-in user. */
export async function setProfile(profile: Profile): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!userId) {
    return { success: false, error: 'unauthorized' }
  }

  if (profile !== 'organizer' && profile !== 'player') {
    return { success: false, error: 'invalidProfile' }
  }

  const user = await User.find(userId)

  if (!user) {
    return { success: false, error: 'unauthorized' }
  }

  user.profile = profile
  await user.save()
  await unstable_update({})
  revalidatePath('/', 'layout')

  return { success: true }
}

/** Changes the interface language (stored in a cookie). */
export async function setLocale(locale: string): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return
  }

  const cookieStore = await cookies()

  cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: '/' })
}
