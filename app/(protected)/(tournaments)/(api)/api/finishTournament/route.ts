import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/finishTournament — marks the tournament as finished. */
export const POST = withAuth(async (request, context, userId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  tournament.status = TournamentStatus.FINISHED
  tournament.updatedAt = new Date()
  await tournament.save()
})
