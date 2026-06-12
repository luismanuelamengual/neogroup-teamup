import { getPlayerActiveTournaments } from '@/app/(tournaments)/services/queries'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/active — tournaments where the signed-in user participates. */
export const POST = withAuth(async (request, context, userId) => {
  return getPlayerActiveTournaments(userId)
})
