import { deleteUser } from '@/app/(protected)/(users)/services/users'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/deleteUser — permanently deletes a user of the organization.
 * Rejected when the account has activity attached to it. Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }

  if (!id) {
    throw new ApiException('missingFields')
  }

  await deleteUser(organizationId, Number(id))

  return null
})
