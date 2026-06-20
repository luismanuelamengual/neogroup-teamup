import { getOrganizationStats } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getOrganizationStats — organization-wide stats for the organizer home dashboard. */
export const POST = withAuth(async (_request, _context, _userId, organizationId) => {
  return getOrganizationStats(organizationId)
})
