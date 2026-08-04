import { auth, unstable_update } from '@/app/(auth)/services/auth'
import { AccountInput } from '@/app/(protected)/(account)/models/AccountInput'
import { Site } from '@/app/(protected)/(sites)/models/Site'
import { ApiException } from '@/app/models/ApiException'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { getOrganization } from '@/app/services/organizations'
import { withApi } from '@/app/utils/api-server'
import { isValidRole } from '@/app/utils/users'

type UpdateAccountBody = Partial<AccountInput & { roleId: Role }>

/**
 * Resolves the user's home venue ("sede"): sites belong to the catalogue the
 * administrator maintains (/sites ABM), so an id that is not one of the
 * organization's sites is rejected rather than silently stored. `null` /
 * undefined means "no site", which stays valid.
 */
async function resolveSiteId(organizationId: number, siteId: unknown): Promise<number | null> {
  if (siteId === undefined || siteId === null || siteId === '') {
    return null
  }

  const id = Number(siteId)

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  const site = await Site.where('organizationId', organizationId).where('id', id).first()

  if (!site) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  return site.id
}

/**
 * POST /api/updateAccount — unified account update endpoint.
 *
 * Dispatches based on which fields are present in the body:
 * - { roleId }                      → assigns the user role once (auth required)
 * - { firstName, lastName, siteId } → updates personal information (auth required)
 */
export const POST = withApi(async (request, _context, organizationId) => {
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

    const organization = await getOrganization({ id: organizationId })
    const allowedRoles = organization?.allowedRegistrationRoles ?? []

    if (!allowedRoles.includes(roleId!)) {
      throw new ApiException('invalidRole')
    }

    const user = await User.find(userId)

    if (!user) {
      throw new ApiException('unauthorized', 401)
    }

    if (user.roleId != null) {
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
  user.phoneNumber = (body.phoneNumber ?? '').trim() || null
  user.siteId = await resolveSiteId(organizationId, body.siteId)
  await user.save()
  await unstable_update({})
})
