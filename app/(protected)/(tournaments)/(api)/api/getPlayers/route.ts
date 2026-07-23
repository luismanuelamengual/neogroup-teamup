import { getPlayers } from '@/app/(protected)/(tournaments)/services/players'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getPlayers — searches players (roleId = PLAYER) by name, nickname or email (partner selection).
 * An empty query returns a default list of players so the picker isn't empty before the user types anything.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { query } = (await request.json()) as { query?: string }
  const { data } = await getPlayers({ query, excludeIds: [userId] })

  return data
})
