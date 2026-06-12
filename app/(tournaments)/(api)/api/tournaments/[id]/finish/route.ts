import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/finish — marks the tournament as finished. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  tournament.status = TournamentStatus.FINISHED
  tournament.updatedAt = new Date()
  await tournament.save()
})
