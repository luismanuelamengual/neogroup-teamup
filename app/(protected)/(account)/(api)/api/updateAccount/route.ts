import { auth, unstable_update } from '@/app/(auth)/services/auth'
import { AccountInput } from '@/app/(protected)/(account)/models/AccountInput'
import { ApiException } from '@/app/models/ApiException'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { withApi } from '@/app/utils/api-server'
import { isValidRole } from '@/app/utils/users'

type UpdateAccountBody = Partial<AccountInput & { roleId: Role }>

/**
 * POST /api/updateAccount — unified account update endpoint.
 *
 * Dispatches based on which fields are present in the body:
 * - { roleId }                        → assigns the user role once (auth required)
 * - { firstName, lastName, nickname } → updates personal information (auth required)
 */
export const POST = withApi(async (request, _context, _organizationId) => {
  const body = (await request.json()) as UpdateAccountBody
  // — Auth required for all operations —
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
  user.phoneNumber = (body.phoneNumber ?? '').trim() || null
  await user.save()
  await unstable_update({})
})
