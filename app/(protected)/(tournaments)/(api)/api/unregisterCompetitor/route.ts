import { loadManageableTournament, unregisterCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/unregisterCompetitor — removes a competitor registration (owner, stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, competitorId } = (await request.json()) as {
    tournamentId: number
    competitorId: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await unregisterCompetitor(tournament, Number(competitorId))
})
