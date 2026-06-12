import { createRound, requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/start — sets the tournament ongoing and generates round 1. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  if (tournament.status !== 'stand_by') {
    throw new ApiException('invalidStatus')
  }

  tournament.status = 'ongoing'
  await createRound(tournament, 1)
  await tournament.save()
})
