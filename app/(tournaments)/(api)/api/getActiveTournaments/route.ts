import { getTournaments } from '@/app/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/getActiveTournaments — tournaments where the signed-in user participates. */
export const POST = withAuth(async (request, context, userId) => {
  return getTournaments({ playerId: userId, onlyActive: true, withCompetitors: true })
})
