import { Repository } from '@neogroup/neorm'
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

  const round: Round | null = await Repository.get(Round)
    .where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!round || round.status !== RoundStatus.OPEN) {
    throw new ApiException('invalidStatus')
  }

  const pendingMatches = await Repository.get(Match)
    .where('roundId', round.id)
    .where('status', MatchStatus.PENDING)
    .get()

  if (pendingMatches.length > 0) {
    throw new ApiException('pendingMatches')
  }

  round.status = RoundStatus.CLOSED
  await Repository.get(Round).save(round)
})
