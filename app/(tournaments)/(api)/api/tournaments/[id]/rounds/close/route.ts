import { Match } from '@/app/(tournaments)/entities/Match'
import { Round } from '@/app/(tournaments)/entities/Round'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/rounds/close — closes the current round. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const tournament = await requireOwnedTournament(tournamentId, userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  const round: Round | null = await Round.where('tournamentId', tournamentId)
    .where('number', tournament.currentRound)
    .first()

  if (!round || round.status !== 'open') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  const pendingMatches = await Match.where('roundId', round.id).where('status', 'pending').get()

  if (pendingMatches.length > 0) {
    return apiResponse({ success: false, error: 'pendingMatches' })
  }

  round.status = 'closed'
  await round.save()

  return apiResponse({ success: true })
})
