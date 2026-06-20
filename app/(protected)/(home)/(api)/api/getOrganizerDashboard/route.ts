import { getOrganizerDashboard } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getOrganizerDashboard — owned + organization-wide stats for the organizer home. */
export const POST = withAuth(async (_request, _context, userId, organizationId) => {
  return getOrganizerDashboard(userId, organizationId)
})
