import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getTournamentCategories } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'
import { Tournament } from '../../../models/Tournament'

/** POST /api/closeTournamentRound — closes the current round. */
export const POST = withAuth(async (request) => {
  const { id } = (await request.json()) as { id: number }
  const tournamentId = Number(id)
  const tournament = await Tournament.find(tournamentId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  // The active frontier may span several rounds (one per category/group); close
  // them all once every match is resolved.
  const categories = await getTournamentCategories(tournament)
  const openRounds = await Round.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  )
    .where('active', true)
    .get()

  if (openRounds.length === 0) {
    throw new ApiException('invalidStatus')
  }

  for (const round of openRounds) {
    const pendingMatches = await Match.where('roundId', round.id).where('status', MatchStatus.PENDING).get()

    if (pendingMatches.length > 0) {
      throw new ApiException('pendingMatches')
    }
  }

  for (const round of openRounds) {
    round.status = RoundStatus.CLOSED
    round.active = false
    await round.save()
  }
})
