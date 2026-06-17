import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { getMaxTotalRounds } from '@/app/(tournaments)/services/tournament-engine'
import {
  createRound,
  getTournamentCategoryKeys,
  requireOwnedTournament
} from '@/app/(tournaments)/services/tournament-helpers'
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

  const currentRounds = await Round.where('tournamentId', tournamentId).where('number', tournament.currentRound).get()

  if (currentRounds.length === 0 || currentRounds.some((round) => round.status !== RoundStatus.CLOSED)) {
    throw new ApiException('roundStillOpen')
  }

  const competitors = await Competitor.where('tournamentId', tournamentId).get()
  const groupSizes = getTournamentCategoryKeys(tournament).map((category) =>
    category === null ? competitors.length : competitors.filter((competitor) => competitor.category === category).length
  )
  const totalRounds = getMaxTotalRounds(tournament.type, tournament.settings ?? {}, groupSizes)

  if (tournament.currentRound >= totalRounds) {
    throw new ApiException('noMoreRounds')
  }

  await createRound(tournament, tournament.currentRound + 1)
})
