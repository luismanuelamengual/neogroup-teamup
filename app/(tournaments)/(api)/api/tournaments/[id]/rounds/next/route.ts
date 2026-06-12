import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Round } from '@/app/(tournaments)/entities/Round'
import { getTotalRounds } from '@/app/(tournaments)/services/tournament-engine'
import { createRound, requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/rounds/next — starts the next round (the current one must be closed). */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  const currentRound: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!currentRound || currentRound.status !== 'closed') {
    return apiResponse({ success: false, error: 'roundStillOpen' })
  }

  const competitorsCount = (await Competitor.where('tournamentId', tournamentId).get()).length
  const totalRounds = getTotalRounds(tournament.type, tournament.settings ?? {}, competitorsCount)

  if (tournament.currentRound >= totalRounds) {
    return apiResponse({ success: false, error: 'noMoreRounds' })
  }

  return apiResponse(await createRound(tournament, tournament.currentRound + 1))
})
