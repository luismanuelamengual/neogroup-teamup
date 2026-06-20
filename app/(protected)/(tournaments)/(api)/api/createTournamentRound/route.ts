import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getMaxTotalRounds } from '@/app/(protected)/(tournaments)/services/tournament-engine'
import {
  createRound,
  getTournamentCategoryKeys,
  requireOwnedTournament
} from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/createTournamentRound — starts the next round (the current one must be closed). */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { id } = (await request.json()) as { id: number }
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  // The "current" round number is the highest one already materialised; it must
  // be fully closed (no active/open round) before the next one can start.
  const allRounds = await Round.where('tournamentId', tournamentId).get()
  const currentNumber = allRounds.length > 0 ? Math.max(...allRounds.map((round) => round.number)) : 0
  const openAtCurrent = allRounds.filter((round) => round.number === currentNumber && round.status === RoundStatus.OPEN)

  if (currentNumber === 0 || openAtCurrent.length > 0) {
    throw new ApiException('roundStillOpen')
  }

  const competitors = await Competitor.where('tournamentId', tournamentId).get()
  const groupSizes = getTournamentCategoryKeys(tournament).map((categoryId) =>
    categoryId === null
      ? competitors.length
      : competitors.filter((competitor) => competitor.categoryId === categoryId).length
  )
  const totalRounds = getMaxTotalRounds(tournament.type, tournament.settings ?? {}, groupSizes)

  if (currentNumber >= totalRounds) {
    throw new ApiException('noMoreRounds')
  }

  await createRound(tournament, currentNumber + 1)
})
