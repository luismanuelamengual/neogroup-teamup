import { getUpcomingMatches } from '@/app/(protected)/(home)/services/dashboard'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getUpcomingMatches — the player's matches scheduled in the next two weeks, for the home dashboard. */
export const POST = withAuth(async (_request, _context, userId) => {
  return getUpcomingMatches(userId)
})
