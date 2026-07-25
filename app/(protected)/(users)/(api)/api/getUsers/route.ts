import { UserFilters } from '@/app/(protected)/(users)/models/UserFilters'
import { getUsers } from '@/app/(protected)/(users)/services/users'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/getUsers — paginated listing of the organization users for the
 * administrator's management screen. Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const body = (await request.json()) as UserFilters

  return getUsers(organizationId, {
    query: body.query,
    roleId: body.roleId,
    page: body.page,
    pageSize: body.pageSize
  })
})
