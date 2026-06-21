import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/finishTournament — marks the tournament as finished and awards ranking points. */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  tournament.status = TournamentStatus.FINISHED
  tournament.updatedAt = new Date()
  await tournament.save()

  // Grant the configured ranking points to the players. A failure here must not
  // undo the finish, so it is logged and swallowed.
  try {
    await awardRankingPoints(tournament.id, organizationId)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[finishTournament] Failed to award ranking points for tournament ${tournament.id}:`, error)
  }
})
