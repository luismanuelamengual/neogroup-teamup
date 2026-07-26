import { deleteSite } from '@/app/(protected)/(sites)/services/sites'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/deleteSite — permanently deletes a site of the organization.
 * Rejected when a tournament still points at it. Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }

  if (!id) {
    throw new ApiException('missingFields')
  }

  await deleteSite(organizationId, Number(id))

  return null
})
