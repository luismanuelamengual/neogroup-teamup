import { ApiResult } from '@/app/_models/api'
import { Competitor } from '@/app/_models/Competitor'
import { toMatchDto } from '@/app/_models/dtos'
import { Match } from '@/app/_models/Match'
import { Round } from '@/app/_models/Round'
import { Tournament } from '@/app/_models/Tournament'
import { generateRoundPairings } from '@/app/_utils/tournament-engine'

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/** Returns the tournament only when it exists and belongs to the user. */
export async function requireOwnedTournament(tournamentId: number, userId: number): Promise<Tournament | null> {
  const tournament: Tournament | null = await Tournament.find(tournamentId)

  if (!tournament || tournament.ownerId !== userId) {
    return null
  }

  return tournament
}

/** Generates and persists the pairings/matches of a round. */
export async function createRound(tournament: Tournament, roundNumber: number): Promise<ApiResult> {
  const competitors = await Competitor.where('tournamentId', tournament.id).orderBy('id').get()
  const competitorIds: number[] = competitors.map((competitor: any) => competitor.id)

  if (competitorIds.length < 2) {
    return { success: false, error: 'notEnoughCompetitors' }
  }

  let previousRoundMatches: Match[] = []

  if (roundNumber > 1) {
    const previousRound: Round | null = await Round.where('tournamentId', tournament.id)
      .where('number', roundNumber - 1)
      .first()

    if (previousRound) {
      previousRoundMatches = await Match.where('roundId', previousRound.id).get()
    }
  }

  const pairings = generateRoundPairings(
    tournament.type,
    tournament.settings ?? {},
    competitorIds,
    roundNumber,
    previousRoundMatches.map(toMatchDto)
  )

  if (pairings.length === 0) {
    return { success: false, error: 'noMatchesGenerated' }
  }

  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = 'open'
  round.createdAt = new Date()
  await round.save()

  for (const pairing of pairings) {
    const match = new Match()

    match.tournamentId = tournament.id
    match.roundId = round.id
    match.position = pairing.position
    match.homeCompetitorIds = pairing.home
    match.awayCompetitorIds = pairing.away
    match.score = null

    // Byes (playoff only) are stored as already resolved in favor of "home".
    if (pairing.away === null) {
      match.status = 'walkover'
      match.winner = 'home'
    } else {
      match.status = 'pending'
      match.winner = null
    }

    match.createdAt = new Date()
    match.updatedAt = new Date()
    await match.save()
  }

  tournament.currentRound = roundNumber
  tournament.updatedAt = new Date()
  await tournament.save()

  return { success: true }
}
