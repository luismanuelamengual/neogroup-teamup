import { Match } from '@/app/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/rounds/close — closes the current round. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  const round: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!round || round.status !== RoundStatus.OPEN) {
    throw new ApiException('invalidStatus')
  }

  const pendingMatches = await Match.where('roundId', round.id).where('status', MatchStatus.PENDING).get()

  if (pendingMatches.length > 0) {
    throw new ApiException('pendingMatches')
  }

  round.status = RoundStatus.CLOSED
  await round.save()
})
