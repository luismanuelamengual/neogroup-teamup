import { Repository } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Match } from '@/app/(tournaments)/models/Match'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { generateRoundPairings } from '@/app/(tournaments)/services/tournament-engine'
import { ApiException } from '@/app/models/ApiException'

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/** Returns the tournament only when it exists and belongs to the user. */
export async function requireOwnedTournament(tournamentId: number, userId: number): Promise<Tournament | null> {
  const tournament: Tournament | null = await Repository.get(Tournament).find(tournamentId)

  if (!tournament || tournament.ownerId !== userId) {
    return null
  }

  return tournament
}

/** Generates and persists the pairings/matches of a round. Throws ApiException when not possible. */
export async function createRound(tournament: Tournament, roundNumber: number): Promise<void> {
  const competitors = await Repository.get(Competitor).where('tournamentId', tournament.id).orderBy('id').get()
  const competitorIds: number[] = competitors.map((competitor) => competitor.id)

  if (competitorIds.length < 2) {
    throw new ApiException('notEnoughCompetitors')
  }

  let previousRoundMatches: Match[] = []

  if (roundNumber > 1) {
    const previousRound: Round | null = await Repository.get(Round)
      .where('tournamentId', tournament.id)
      .where('number', roundNumber - 1)
      .with('matches')
      .first()

    if (previousRound) {
      previousRoundMatches = previousRound.matches ?? []
    }
  }

  const pairings = generateRoundPairings(
    tournament.type,
    tournament.settings ?? {},
    competitorIds,
    roundNumber,
    previousRoundMatches
  )

  if (pairings.length === 0) {
    throw new ApiException('noMatchesGenerated')
  }

  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = RoundStatus.OPEN
  round.createdAt = new Date()
  await Repository.get(Round).save(round)

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
      match.status = MatchStatus.WALKOVER
      match.winner = MatchSide.HOME
    } else {
      match.status = MatchStatus.PENDING
      match.winner = null
    }

    match.createdAt = new Date()
    match.updatedAt = new Date()
    await Repository.get(Match).save(match)
  }

  tournament.currentRound = roundNumber
  tournament.updatedAt = new Date()
  await Repository.get(Tournament).save(tournament)
}
