import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  generateRoundPairings,
  getMaxTotalRounds,
  getTotalRounds
} from '@/app/(protected)/(tournaments)/services/tournament-engine'
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

  // For playoffs: propagate any auto-resolved bye (walkover) matches into the
  // next round immediately so the bracket is coherent from the moment the
  // tournament starts. Also close+advance in the unlikely case the whole round
  // consists of byes (e.g. a 2-competitor bracket with byes everywhere).
  if (tournament.type === TournamentType.PLAYOFF) {
    const createdRounds = await Round.where('tournamentId', tournament.id).where('number', roundNumber).get()

    for (const round of createdRounds) {
      await syncPlayoffNextRound(tournament, round)
    }

    await closeRoundAndAdvance(tournament)
  }
}

/** Competitor ids of the winning side of a resolved match (null when unresolved). */
function matchWinnerIds(match: Match): number[] | null {
  if (match.winner === MatchSide.HOME) {
    return match.homeCompetitorIds
  }

  if (match.winner === MatchSide.AWAY && match.awayCompetitorIds) {
    return match.awayCompetitorIds
  }

  return null
}

/**
 * Playoff: incrementally builds the next bracket round from the winners known so
 * far. Runs after every result so organizers/players can watch competitors
 * advance live. The next round (and its matches) is created on demand the first
 * time a winner is available, and each still-pending next-round match is kept in
 * sync with the current winners. Matches that already hold a result (i.e. the
 * next round has become the active one) are never overwritten. Unknown sides are
 * stored as an empty competitor list so they render as "to be defined".
 */
async function syncPlayoffNextRound(tournament: Tournament, currentRound: Round): Promise<void> {
  const currentMatches = await Match.where('roundId', currentRound.id).orderBy('position').get()

  // A single match means this is the final: there is no round beyond it.
  if (currentMatches.length <= 1) {
    return
  }

  const nextNumber = currentRound.number + 1
  const candidateRounds = await Round.where('tournamentId', tournament.id).where('number', nextNumber).get()
  let nextRound = candidateRounds.find((round) => (round.category ?? null) === (currentRound.category ?? null)) ?? null

  if (!nextRound) {
    nextRound = new Round()
    nextRound.tournamentId = tournament.id
    nextRound.number = nextNumber
    nextRound.status = RoundStatus.OPEN
    nextRound.category = currentRound.category
    nextRound.createdAt = new Date()
    await nextRound.save()
  }

  const existingMatches = await Match.where('roundId', nextRound.id).get()
  const byPosition = new Map(existingMatches.map((match) => [match.position, match]))
  const sorted = [...currentMatches].sort((a, b) => a.position - b.position)
  const nextCount = Math.ceil(sorted.length / 2)

  for (let position = 0; position < nextCount; position++) {
    const homeSource = sorted[position * 2]
    const awaySource = sorted[position * 2 + 1]
    const homeIds = homeSource ? matchWinnerIds(homeSource) : null
    const awayIds = awaySource ? matchWinnerIds(awaySource) : null
    let match = byPosition.get(position) ?? null

    // Don't touch a next-round match that already holds its own result.
    if (match && match.status !== MatchStatus.PENDING) {
      continue
    }

    if (!match) {
      match = new Match()
      match.tournamentId = tournament.id
      match.roundId = nextRound.id
      match.position = position
      match.score = null
      match.status = MatchStatus.PENDING
      match.winner = null
      match.createdAt = new Date()
    }

    match.homeCompetitorIds = homeIds ?? []
    match.awayCompetitorIds = awayIds ?? []
    match.updatedAt = new Date()
    await match.save()
  }
}

/**
 * Closes the current round (every category sharing the round number) and starts
 * the next one — but only once every match of the round is resolved. When no
 * round is left the tournament is finished. For playoffs the next round was
 * already materialised incrementally, so we just advance the pointer.
 */
async function closeRoundAndAdvance(tournament: Tournament): Promise<void> {
  const rounds = await Round.where('tournamentId', tournament.id)
    .where('number', tournament.currentRound)
    .with('matches')
    .get()
  const openRounds = rounds.filter((round) => round.status === RoundStatus.OPEN)

  if (openRounds.length === 0) {
    return
  }

  // The round is complete only when no match across any category is pending.
  const hasPending = openRounds.some((round) =>
    (round.matches ?? []).some((match) => match.status === MatchStatus.PENDING)
  )

  if (hasPending) {
    return
  }

  for (const round of openRounds) {
    round.status = RoundStatus.CLOSED
    await round.save()
  }

  const competitors = await Competitor.where('tournamentId', tournament.id).get()
  const groupSizes = getTournamentCategoryKeys(tournament).map((category) =>
    category === null ? competitors.length : competitors.filter((competitor) => competitor.category === category).length
  )
  const totalRounds = getMaxTotalRounds(tournament.type, tournament.settings ?? {}, groupSizes)

  if (tournament.currentRound >= totalRounds) {
    tournament.status = TournamentStatus.FINISHED
    tournament.updatedAt = new Date()
    await tournament.save()

    return
  }

  if (tournament.type === TournamentType.PLAYOFF) {
    // Next-round matches already exist (built as results came in); just advance.
    tournament.currentRound = tournament.currentRound + 1
    tournament.updatedAt = new Date()
    await tournament.save()
  } else {
    await createRound(tournament, tournament.currentRound + 1)
  }
}

/**
 * Drives the whole tournament flow after a single result is saved or edited, so
 * organizers never have to close rounds or trigger the next ones by hand.
 *
 * - League / Americano: scores are reflected immediately (standings are computed
 *   from the matches), and the next round is generated automatically once the
 *   last result of the current round is loaded.
 * - Playoff: every result propagates the winners into the next round (created on
 *   demand) so the upcoming bracket fills in live; the round closes and the
 *   pointer advances once all its matches are resolved.
 *
 * When the final round completes the tournament is marked as finished.
 */
export async function progressTournamentAfterResult(tournament: Tournament, round: Round): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  if (tournament.type === TournamentType.PLAYOFF) {
    await syncPlayoffNextRound(tournament, round)
  }

  await closeRoundAndAdvance(tournament)
}
