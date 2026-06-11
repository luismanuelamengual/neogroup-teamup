import { Competitor } from '@/app/_models/Competitor'
import { Match } from '@/app/_models/Match'
import { Round } from '@/app/_models/Round'
import { Tournament } from '@/app/_models/Tournament'
import { MatchScore } from '@/app/_models/types'
import { apiResponse, withAuth } from '@/app/_utils/api-server'
import { getScoreWinner, isValidScore } from '@/app/_utils/score'

/**
 * PUT /api/matches/[id]/result — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match,
 * while the match round is open.
 */
export const PUT = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const { score } = (await request.json()) as { score: MatchScore }
  const match: Match | null = await Match.find(Number(id))

  if (!match || !match.awayCompetitorIds) {
    return apiResponse({ success: false, error: 'notFound' })
  }

  const tournament: Tournament | null = await Tournament.find(match.tournamentId)

  if (!tournament || tournament.status !== 'ongoing') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  const round: Round | null = await Round.find(match.roundId)

  if (!round || round.status !== 'open') {
    return apiResponse({ success: false, error: 'roundClosed' })
  }

  const isOwner = tournament.ownerId === userId

  if (!isOwner) {
    const competitorIds = [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]
    const participants = await Competitor.whereIn('id', competitorIds).get()
    const isParticipant = participants.some(
      (competitor: any) => competitor.userId === userId || competitor.partnerUserId === userId
    )

    if (!isParticipant) {
      return apiResponse({ success: false, error: 'unauthorized' })
    }
  }

  if (!isValidScore(score, tournament.scoreFormat)) {
    return apiResponse({ success: false, error: 'invalidScore' })
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

  return apiResponse({ success: true })
})
