import { getPlayerStats } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/**
 * @deprecated Use /api/getPlayerStats instead.
 * POST /api/getPlayerDashboard — kept for backwards compatibility.
 */
export const POST = withAuth(async (_request, _context, userId) => {
  return getPlayerStats(userId)
})
