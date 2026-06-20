import { getPlayerStats } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getPlayerStats — aggregated stats for the player home dashboard. */
export const POST = withAuth(async (_request, _context, userId, organizationId) => {
  return getPlayerStats(userId, organizationId)
})
