import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Match } from '@/app/(tournaments)/models/Match'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { generateRoundPairings, getTotalRounds } from '@/app/(tournaments)/services/tournament-engine'
import { ApiException } from '@/app/models/ApiException'

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/** Returns the tournament only when it exists and belongs to the user. */
export async function requireOwnedTournament(tournamentId: number, userId: number): Promise<Tournament | null> {
  const tournament = await Tournament.find(tournamentId)

  if (!tournament || tournament.ownerId !== userId) {
    return null
  }

  return tournament
}

/**
 * Category keys a tournament runs in parallel. Returns the configured category
 * names, or `[null]` (a single group) when the tournament has no categories.
 */
export function getTournamentCategoryKeys(tournament: Tournament): (string | null)[] {
  return tournament.categories && tournament.categories.length > 0 ? tournament.categories : [null]
}

/** Persists the pairings/matches of a single category group within a round. */
async function createCategoryRound(
  tournament: Tournament,
  roundNumber: number,
  category: string | null,
  competitorIds: number[],
  previousRoundMatches: Match[]
): Promise<boolean> {
  const pairings = generateRoundPairings(
    tournament.type,
    tournament.settings ?? {},
    competitorIds,
    roundNumber,
    previousRoundMatches
  )

  if (pairings.length === 0) {
    return false
  }

  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = RoundStatus.OPEN
  round.category = category
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
      match.status = MatchStatus.WALKOVER
      match.winner = MatchSide.HOME
    } else {
      match.status = MatchStatus.PENDING
      match.winner = null
    }

    match.createdAt = new Date()
    match.updatedAt = new Date()
    await match.save()
  }

  return true
}

/**
 * Generates and persists the pairings/matches of a round. When the tournament
 * has categories, every category that still has rounds left is generated in
 * parallel. Throws ApiException when no matches could be generated at all.
 */
export async function createRound(tournament: Tournament, roundNumber: number): Promise<void> {
  const competitors = await Competitor.where('tournamentId', tournament.id).orderBy('id').get()
  const categoryKeys = getTournamentCategoryKeys(tournament)

  if (competitors.length < 2) {
    throw new ApiException('notEnoughCompetitors')
  }

  // Previous round rows (with matches) are needed to seed playoff brackets.
  let previousRounds: Round[] = []

  if (roundNumber > 1) {
    previousRounds = await Round.where('tournamentId', tournament.id)
      .where('number', roundNumber - 1)
      .with('matches')
      .get()
  }

  let anyCreated = false

  for (const category of categoryKeys) {
    const groupCompetitors = category === null ? competitors : competitors.filter((c) => c.category === category)
    const competitorIds = groupCompetitors.map((competitor) => competitor.id)

    if (competitorIds.length < 2) {
      continue
    }

    // Skip categories that already played all their rounds.
    if (roundNumber > getTotalRounds(tournament.type, tournament.settings ?? {}, competitorIds.length)) {
      continue
    }

    const previousRound = previousRounds.find((round) => (round.category ?? null) === category)
    const created = await createCategoryRound(
      tournament,
      roundNumber,
      category,
      competitorIds,
      previousRound?.matches ?? []
    )

    anyCreated = anyCreated || created
  }

  if (!anyCreated) {
    throw new ApiException('noMatchesGenerated')
  }

  tournament.currentRound = roundNumber
  tournament.updatedAt = new Date()
  await tournament.save()
}
