import { getPlayerDashboard } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getPlayerDashboard — aggregated stats + active tournaments for the player home. */
export const POST = withAuth(async (_request, _context, userId, organizationId) => {
  return getPlayerDashboard(userId, organizationId)
})
