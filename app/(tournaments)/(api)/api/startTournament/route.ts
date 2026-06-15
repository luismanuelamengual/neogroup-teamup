import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { createRound, requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/startTournament — sets the tournament ongoing and generates round 1. */
export const POST = withAuth(async (request, context, userId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)
  await tournament.save()
})
