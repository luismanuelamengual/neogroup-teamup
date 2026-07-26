import { SiteFilters } from '@/app/(protected)/(sites)/models/SiteFilters'
import { getSites } from '@/app/(protected)/(sites)/services/sites'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getSites — paginated listing of the sites of the organization.
 *
 * Available to any signed-in user (not only administrators): it also feeds the
 * SiteSelector that organizers use when creating or editing a tournament.
 */
export const POST = withAuth(async (request, _context, _userId, organizationId) => {
  const body = (await request.json()) as SiteFilters

  return getSites(organizationId, { query: body.query, page: body.page, pageSize: body.pageSize })
})
