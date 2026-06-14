import { getTournaments, TournamentOptions } from '@/app/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/list — tournaments owned by the signed-in user. */
export const POST = withAuth(async (request, context, userId) => {
  const { name, onlyActive } = (await request.json()) as TournamentOptions

  return getTournaments({ ownerId: userId, name, onlyActive, withCompetitors: true })
})
