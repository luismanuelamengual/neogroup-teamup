import { loadManageableTournament, unregisterCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/unregisterCompetitor — removes a competitor registration (any
 * organizer of the organization, not just the creator).
 *
 * Works on a running tournament too, but only for a competitor that can come
 * out without leaving a trace in what is being played — see utils/lateRemoval.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, competitorId } = (await request.json()) as {
    tournamentId: number
    competitorId: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId, { allowOngoing: true })

  await unregisterCompetitor(tournament, Number(competitorId))
})
