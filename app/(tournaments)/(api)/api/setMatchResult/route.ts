import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Match } from '@/app/(tournaments)/models/Match'
import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { progressTournamentAfterResult } from '@/app/(tournaments)/services/tournament-helpers'
import { getScoreWinner, isValidScore } from '@/app/(tournaments)/utils/score'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/setMatchResult — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match,
 * while the match round is open.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { id, score } = (await request.json()) as { id: number; score: MatchScore }
  const match = await Match.where('id', Number(id)).with('tournament', 'round').first()

  if (!match || !match.awayCompetitorIds) {
    throw new ApiException('notFound')
  }

  const tournament = match.tournament ?? null

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  const round = match.round ?? null

  if (!round || round.status !== RoundStatus.OPEN) {
    throw new ApiException('roundClosed')
  }

  const isOwner = tournament.ownerId === userId

  if (!isOwner) {
    const competitorIds = [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]
    const participants = await Competitor.whereIn('id', competitorIds).get()
    const isParticipant = participants.some(
      (competitor) => competitor.userId === userId || competitor.partnerUserId === userId
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
    match.status = MatchStatus.WALKOVER
    match.winner = score.walkover
  } else {
    match.score = score
    match.status = MatchStatus.PLAYED
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()

  // Automatically drive the tournament forward: update pairings/standings, close
  // the round and create the next one (or finish) without any organizer action.
  await progressTournamentAfterResult(tournament, round)
})
