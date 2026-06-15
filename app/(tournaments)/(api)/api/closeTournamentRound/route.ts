import { Match } from '@/app/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/closeTournamentRound — closes the current round. */
export const POST = withAuth(async (request, context, userId) => {
  const { id } = (await request.json()) as { id: number }
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  // A round number may span several rounds (one per category); close them all.
  const rounds = await Round.where('tournamentId', tournamentId).where('number', tournament.currentRound).get()
  const openRounds = rounds.filter((round) => round.status === RoundStatus.OPEN)

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
    await round.save()
  }
})
