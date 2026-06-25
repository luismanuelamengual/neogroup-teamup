import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { progressTournamentAfterResult } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { getScoreWinner, isValidScore, serializeScore } from '@/app/(protected)/(tournaments)/utils/score'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/setMatchResult — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match,
 * while the match round is open.
 */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { id, score } = (await request.json()) as { id: number; score: MatchScore }
  const match = await Match.where('id', Number(id)).with('tournamentCategory.tournament', 'round').first()

  if (!match || !match.awayCompetitorIds) {
    throw new ApiException('notFound')
  }

  const tournament = match.tournamentCategory?.tournament ?? null

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  const round = match.round ?? null

  // A round is editable while it is active: the current frontier, plus any
  // just-completed round still inside its grace window (closed but active).
  if (!round || !round.active) {
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
    match.score = serializeScore({ walkover: score.walkover }, tournament.scoreFormat)
    match.status = MatchStatus.WALKOVER
    match.winner = score.walkover
  } else {
    match.score = serializeScore(score, tournament.scoreFormat)
    match.status = MatchStatus.PLAYED
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()

  // Automatically drive the tournament forward: update pairings/standings, close
  // the round and create the next one (or finish) without any organizer action.
  await progressTournamentAfterResult(tournament, round)
})
