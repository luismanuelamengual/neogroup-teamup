import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Round } from '@/app/(tournaments)/entities/Round'
import { getTotalRounds } from '@/app/(tournaments)/services/tournament-engine'
import { createRound, requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/rounds/next — starts the next round (the current one must be closed). */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    throw new ApiException('invalidStatus')
  }

  const currentRound: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!currentRound || currentRound.status !== 'closed') {
    throw new ApiException('roundStillOpen')
  }

  const competitorsCount = (await Competitor.where('tournamentId', tournamentId).get()).length
  const totalRounds = getTotalRounds(tournament.type, tournament.settings ?? {}, competitorsCount)

  if (tournament.currentRound >= totalRounds) {
    throw new ApiException('noMoreRounds')
  }

  await createRound(tournament, tournament.currentRound + 1)
})
