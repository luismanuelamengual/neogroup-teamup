import { Repository } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { getTotalRounds } from '@/app/(tournaments)/services/tournament-engine'
import { createRound, requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/createTournamentRound — starts the next round (the current one must be closed). */
export const POST = withAuth(async (request, context, userId) => {
  const { id } = (await request.json()) as { id: number }
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  const currentRound: Round | null = await Repository.get(Round)
    .where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!currentRound || currentRound.status !== RoundStatus.CLOSED) {
    throw new ApiException('roundStillOpen')
  }

  const competitorsCount = (await Repository.get(Competitor).where('tournamentId', tournamentId).get()).length
  const totalRounds = getTotalRounds(tournament.type, tournament.settings ?? {}, competitorsCount)

  if (tournament.currentRound >= totalRounds) {
    throw new ApiException('noMoreRounds')
  }

  await createRound(tournament, tournament.currentRound + 1)
})
