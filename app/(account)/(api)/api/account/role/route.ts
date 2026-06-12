import { User } from '@/app/(auth)/models/User'
import { UserRoleId } from '@/app/(auth)/models/UserRoles'
import { unstable_update } from '@/app/(auth)/services/auth'
import { isValidRoleId } from '@/app/(auth)/utils/user'
import { ApiException, withAuth } from '@/app/utils/api-server'

/**
 * POST /api/account/role — assigns the user role once (first login without a
 * role, e.g. Google sign-up). The role cannot be changed afterwards.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { roleId } = (await request.json()) as { roleId: UserRoleId }

  if (!isValidRoleId(roleId)) {
    throw new ApiException('invalidRole')
  }

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('unauthorized', 401)
  }

  if (user.roleId) {
    throw new ApiException('roleAlreadyAssigned')
  }

  user.roleId = roleId
  await user.save()
  await unstable_update({})
})
