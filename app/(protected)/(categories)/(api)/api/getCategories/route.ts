import { CategoryFilters } from '@/app/(protected)/(categories)/models/CategoryFilters'
import { getCategories } from '@/app/(protected)/(categories)/services/categories'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getCategories — paginated listing of the categories of the
 * organization, searchable by name and optionally restricted to a discipline
 * or a set of ids.
 *
 * Available to any signed-in user, not only administrators: it powers both
 * the CategorySelector that organizers use in the tournament form and the
 * administrator's categories browser. create/update/delete stay admin-only
 * (/createCategory, /updateCategory, /deleteCategory).
 */
export const POST = withAuth(async (request) => {
  const body = (await request.json()) as CategoryFilters

  return getCategories({
    query: body.query,
    discipline: body.discipline,
    ids: body.ids,
    page: body.page,
    pageSize: body.pageSize
  })
})
