import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { getManagedCategories } from '@/app/(protected)/(categories)/services/categories'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/getManagedCategories — paginated listing of the organization
 * categories for the administrator's management screen. Administrator only.
 *
 * The read-only listing that feeds the CategorySelector is /api/getCategories,
 * which is open to every signed-in user.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const body = (await request.json()) as CategoryFilters

  return getManagedCategories(organizationId, {
    query: body.query,
    discipline: body.discipline,
    page: body.page,
    pageSize: body.pageSize
  })
})
