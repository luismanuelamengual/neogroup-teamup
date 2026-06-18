import { cookies } from 'next/headers'
import { Role } from '@/app/(auth)/models/Role'
import { User } from '@/app/(auth)/models/User'
import { auth, unstable_update } from '@/app/(auth)/services/auth'
import { isValidRole } from '@/app/(auth)/utils/user'
import { AccountInput } from '@/app/(protected)/(account)/actions/account'
import { ApiException } from '@/app/models/ApiException'
import { withApi } from '@/app/utils/api-server'
import { LOCALE_COOKIE, SUPPORTED_LOCALES, SupportedLocale } from '@/app/utils/lang'

type UpdateAccountBody = Partial<AccountInput & { roleId: Role; locale: string }>

/**
 * POST /api/updateAccount — unified account update endpoint.
 *
 * Dispatches based on which fields are present in the body:
 * - { locale }                        → changes the interface language (no auth required)
 * - { roleId }                        → assigns the user role once (auth required)
 * - { firstName, lastName, nickname } → updates personal information (auth required)
 */
export const POST = withApi(async (request, _context, _organizationId) => {
  const body = (await request.json()) as UpdateAccountBody

  // — Locale (no auth required) —
  if ('locale' in body) {
    const { locale } = body

    if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
      throw new ApiException('invalidLocale')
    }

    const cookieStore = await cookies()

    cookieStore.set(LOCALE_COOKIE, locale as string, { maxAge: 60 * 60 * 24 * 365, path: '/' })

    return
  }

  // — Auth required for the remaining operations —
  const session = await auth()
  const userId = session?.user?.id ? Number(session.user.id) : null

  if (!userId) {
    throw new ApiException('unauthorized', 401)
  }

  // — Role assignment —
  if ('roleId' in body) {
    const { roleId } = body

    if (!isValidRole(roleId!)) {
      throw new ApiException('invalidRole')
    }

    const user = await User.find(userId)

    if (!user) {
      throw new ApiException('unauthorized', 401)
    }

    if (user.roleId) {
      throw new ApiException('roleAlreadyAssigned')
    }

    user.roleId = roleId!
    await user.save()
    await unstable_update({})

    return
  }

  // — Profile update —
  const firstName = (body.firstName ?? '').trim()
  const lastName = (body.lastName ?? '').trim()

  if (!firstName || !lastName) {
    throw new ApiException('missingFields')
  }

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('unauthorized', 401)
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nickname = (body.nickname ?? '').trim() || null
  await user.save()
  await unstable_update({})
})
