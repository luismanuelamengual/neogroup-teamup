import { deleteCategory } from '@/app/(protected)/(categories)/services/categories'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/deleteCategory — permanently deletes a category of the organization.
 * Rejected when a tournament or a ranking still points at it. Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }

  if (!id) {
    throw new ApiException('missingFields')
  }

  await deleteCategory(organizationId, Number(id))

  return null
})
