import { resetUserPassword } from '@/app/(protected)/(users)/services/users'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/resetUserPassword — emails a user of the organization a link to set
 * a new password. The administrator never sees or chooses the password.
 * Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }

  if (!id) {
    throw new ApiException('missingFields')
  }

  await resetUserPassword(organizationId, Number(id), request.headers.get('host') ?? '')

  return null
})
