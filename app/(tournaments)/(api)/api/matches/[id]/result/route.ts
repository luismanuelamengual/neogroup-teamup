import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Match } from '@/app/(tournaments)/entities/Match'
import { Round } from '@/app/(tournaments)/entities/Round'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { MatchScore } from '@/app/(tournaments)/models/types'
import { getScoreWinner, isValidScore } from '@/app/(tournaments)/utils/score'
import { ApiException, withAuth } from '@/app/utils/api-server'

/**
 * POST /api/matches/[id]/result — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match,
 * while the match round is open.
 */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const { score } = (await request.json()) as { score: MatchScore }
  const match: Match | null = await Match.find(Number(id))

  if (!match || !match.awayCompetitorIds) {
    throw new ApiException('notFound')
  }

  const tournament: Tournament | null = await Tournament.find(match.tournamentId)

  if (!tournament || tournament.status !== 'ongoing') {
    throw new ApiException('invalidStatus')
  }

  const round: Round | null = await Round.find(match.roundId)

  if (!round || round.status !== 'open') {
    throw new ApiException('roundClosed')
  }

  const isOwner = tournament.ownerId === userId

  if (!isOwner) {
    const competitorIds = [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]
    const participants = await Competitor.whereIn('id', competitorIds).get()
    const isParticipant = participants.some(
      (competitor: any) => competitor.userId === userId || competitor.partnerUserId === userId
    )

    if (!isParticipant) {
      throw new ApiException('unauthorized')
    }
  }

  if (!isValidScore(score, tournament.scoreFormat)) {
    throw new ApiException('invalidScore')
  }

  if (score.walkover) {
    match.score = { walkover: score.walkover }
    match.status = 'walkover'
    match.winner = score.walkover
  } else {
    match.score = score
    match.status = 'played'
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()
})
