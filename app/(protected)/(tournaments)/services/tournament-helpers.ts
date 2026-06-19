import { BRACKET_CONSOLATION, BRACKET_PLAYOFF, groupBracket } from '@/app/(protected)/(tournaments)/models/Bracket'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  assignGroups,
  generateRoundPairings,
  generateRoundRobinRound,
  getBracketSize,
  getGroupPhaseRounds,
  getKnockoutRounds,
  getTotalRounds,
  Pairing,
  seedFromGroups,
  seedPlayoffPairings
} from '@/app/(protected)/(tournaments)/services/tournament-engine'
import { getSetsWon } from '@/app/(protected)/(tournaments)/utils/score'
import { ApiException } from '@/app/models/ApiException'

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/** Round-robin rounds (circle method) needed for `size` competitors. */
function roundRobinRoundsFor(size: number): number {
  if (size < 2) {
    return 0
  }

  return size % 2 === 0 ? size - 1 : size
}

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

/** Whether a round belongs to a knockout bracket (so winners advance). */
function isKnockoutRound(tournament: Tournament, round: Round): boolean {
  if (tournament.type === TournamentType.PLAYOFF || tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return true
  }

  if (tournament.type === TournamentType.GROUPS_PLAYOFF) {
    return round.bracket === BRACKET_PLAYOFF
  }

  return false
}

/** All rounds of a single (category, bracket) structure, ordered by number. */
async function getBracketRounds(
  tournamentId: number,
  category: string | null,
  bracket: string | null
): Promise<Round[]> {
  const rounds = await Round.where('tournamentId', tournamentId).get()

  return rounds
    .filter((round) => (round.category ?? null) === (category ?? null) && (round.bracket ?? null) === (bracket ?? null))
    .sort((a, b) => a.number - b.number)
}

/** Whether a (category, bracket) round already exists at the given number. */
async function roundExists(
  tournamentId: number,
  roundNumber: number,
  category: string | null,
  bracket: string | null
): Promise<boolean> {
  const rounds = await Round.where('tournamentId', tournamentId).where('number', roundNumber).get()

  return rounds.some(
    (round) => (round.category ?? null) === (category ?? null) && (round.bracket ?? null) === (bracket ?? null)
  )
}

/** Persists a round and its matches from the given pairings. */
async function persistRound(
  tournament: Tournament,
  roundNumber: number,
  category: string | null,
  bracket: string | null,
  pairings: Pairing[]
): Promise<Round> {
  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = RoundStatus.OPEN
  round.category = category
  round.bracket = bracket
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

    // Byes (knockout only) are stored as already resolved in favor of "home".
    if (pairing.away === null && pairing.home.length > 0) {
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

  return round
}

/**
 * Creates a full knockout bracket up to the final: round 1 is seeded from
 * `seededIds` (top seeds get the byes) and every later round is materialised as
 * empty "to be defined" matches. Known winners (byes) are then propagated
 * forward so the bracket is coherent from the start. Returns 1 when a bracket
 * was created, 0 when there were not enough competitors.
 */
async function createKnockoutBracket(
  tournament: Tournament,
  category: string | null,
  bracket: string | null,
  seededIds: number[],
  startRound: number
): Promise<number> {
  if (seededIds.length < 2) {
    return 0
  }

  const bracketSize = getBracketSize(seededIds.length)
  const totalRounds = getKnockoutRounds(seededIds.length)

  await persistRound(tournament, startRound, category, bracket, seedPlayoffPairings(seededIds))

  for (let roundIndex = 2; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = bracketSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: [], away: [], position })
    }

    await persistRound(tournament, startRound + roundIndex - 1, category, bracket, placeholders)
  }

  // Propagate byes / already-known winners into the following rounds.
  const rounds = await getBracketRounds(tournament.id, category, bracket)

  for (const round of rounds.slice(0, -1)) {
    await syncKnockoutNextRound(tournament, round)
  }

  return 1
}

/**
 * Knockout: keeps the next bracket round in sync with the winners known so far.
 * The next round already exists (materialised up front), so each still-pending
 * next-round match is refreshed with the current winners. Matches that already
 * hold a result are never overwritten. Unknown sides are stored as an empty
 * competitor list so they render as "to be defined".
 */
async function syncKnockoutNextRound(tournament: Tournament, currentRound: Round): Promise<void> {
  const currentMatches = await Match.where('roundId', currentRound.id).orderBy('position').get()

  // A single match means this is the final: there is no round beyond it.
  if (currentMatches.length <= 1) {
    return
  }

  const nextNumber = currentRound.number + 1
  const bracketRounds = await getBracketRounds(
    tournament.id,
    currentRound.category ?? null,
    currentRound.bracket ?? null
  )
  let nextRound = bracketRounds.find((round) => round.number === nextNumber) ?? null

  if (!nextRound) {
    nextRound = new Round()
    nextRound.tournamentId = tournament.id
    nextRound.number = nextNumber
    nextRound.status = RoundStatus.OPEN
    nextRound.category = currentRound.category
    nextRound.bracket = currentRound.bracket
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
 * Computes the entrants of the consolation bracket: every competitor that lost
 * their FIRST real match in the main bracket. A bye (away === null) is not a
 * real match, so competitors who advanced on a bye are only considered once they
 * play (and lose) their actual first match — which happens in round 2.
 *
 * Returns `ready: false` while any competitor still has an unresolved first real
 * match (i.e. the bye players have not played round 2 yet), so the consolation
 * bracket is only built once every entrant is known.
 */
async function computeConsolationSeeds(
  tournament: Tournament,
  category: string | null
): Promise<{ ready: boolean; losers: number[] }> {
  const competitors = (await Competitor.where('tournamentId', tournament.id).orderBy('id').get()).filter(
    (competitor) => category == null || competitor.category === category
  )
  const mainRounds = await getBracketRounds(tournament.id, category, null)
  const roundNumberById = new Map(mainRounds.map((round) => [round.id, round.number]))
  const roundIds = mainRounds.map((round) => round.id)
  const matches = roundIds.length > 0 ? await Match.whereIn('roundId', roundIds).get() : []
  // Real matches (an actual opponent) ordered by round then bracket position.
  const realMatches = matches
    .filter((match) => match.awayCompetitorIds && match.awayCompetitorIds.length > 0)
    .sort((a, b) => roundNumberById.get(a.roundId)! - roundNumberById.get(b.roundId)! || a.position - b.position)
  const losers: number[] = []

  for (const competitor of competitors) {
    const firstRealMatch = realMatches.find(
      (match) =>
        match.homeCompetitorIds.includes(competitor.id) || (match.awayCompetitorIds ?? []).includes(competitor.id)
    )

    // No real match yet (a bye player whose round 2 is not even drawn) → wait.
    if (!firstRealMatch || firstRealMatch.status === MatchStatus.PENDING) {
      return { ready: false, losers: [] }
    }

    const lostAsHome =
      firstRealMatch.winner === MatchSide.AWAY && firstRealMatch.homeCompetitorIds.includes(competitor.id)
    const lostAsAway =
      firstRealMatch.winner === MatchSide.HOME && (firstRealMatch.awayCompetitorIds ?? []).includes(competitor.id)

    if (lostAsHome || lostAsAway) {
      losers.push(competitor.id)
    }
  }

  return { ready: true, losers }
}

/** Ranks the competitors of a round-robin group from its resolved matches. */
function rankGroup(competitorIds: number[], matches: Match[]): number[] {
  const league = DEFAULT_LEAGUE_SETTINGS
  const stats = new Map(competitorIds.map((id) => [id, { points: 0, won: 0, setsWon: 0, gamesWon: 0 }]))

  const add = (
    ids: number[] | null,
    updater: (row: { points: number; won: number; setsWon: number; gamesWon: number }) => void
  ) => {
    for (const id of ids ?? []) {
      const row = stats.get(id)

      if (row) {
        updater(row)
      }
    }
  }

  for (const match of matches) {
    if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)

    add(match.homeCompetitorIds, (row) => {
      row.setsWon += sets.home
      row.points += sets.home * league.pointsPerSetWon

      if (match.winner === MatchSide.HOME) {
        row.won++
        row.points += league.pointsPerMatchWon
      }
    })
    add(match.awayCompetitorIds, (row) => {
      row.setsWon += sets.away
      row.points += sets.away * league.pointsPerSetWon

      if (match.winner === MatchSide.AWAY) {
        row.won++
        row.points += league.pointsPerMatchWon
      }
    })
  }

  return [...competitorIds].sort((a, b) => {
    const rowA = stats.get(a)!
    const rowB = stats.get(b)!

    return (
      rowB.points - rowA.points || rowB.won - rowA.won || rowB.setsWon - rowA.setsWon || rowB.gamesWon - rowA.gamesWon
    )
  })
}

/**
 * Computes the cross-seeded knockout lineup from the final group standings of a
 * groups+playoff category.
 */
async function computeGroupsKnockoutSeeds(
  tournament: Tournament,
  category: string | null,
  competitorIds: number[],
  settings: Tournament['settings']
): Promise<number[]> {
  const safeSettings = settings ?? {}
  const groupSize = safeSettings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
  const qualifiersPerGroup = Math.max(
    1,
    safeSettings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
  )
  const groups = assignGroups(competitorIds, groupSize)
  const allRounds = await getCategoryRounds(tournament.id, category)
  const qualifiers: number[][] = []

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length === 0) {
      continue
    }

    const bracket = groupBracket(index)
    const roundIds = allRounds.filter((round) => (round.bracket ?? null) === bracket).map((round) => round.id)
    const matches = roundIds.length > 0 ? await Match.whereIn('roundId', roundIds).get() : []
    const ranked = rankGroup(group, matches)

    qualifiers.push(ranked.slice(0, Math.min(qualifiersPerGroup, group.length)))
  }

  return seedFromGroups(qualifiers)
}

/** All rounds of a category (any bracket). */
async function getCategoryRounds(tournamentId: number, category: string | null): Promise<Round[]> {
  const rounds = await Round.where('tournamentId', tournamentId).get()

  return rounds.filter((round) => (round.category ?? null) === (category ?? null))
}

/**
 * Creates the matches of round `roundNumber` for a single category, across every
 * bracket/phase that applies. Returns how many rounds were created. Idempotent:
 * skips (category, bracket) rounds that already exist.
 */
async function materializeCategoryRound(
  tournament: Tournament,
  roundNumber: number,
  category: string | null,
  competitorIds: number[]
): Promise<number> {
  const settings = tournament.settings ?? {}

  switch (tournament.type) {
    case TournamentType.LEAGUE:

    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (await roundExists(tournament.id, roundNumber, category, null)) {
        return 0
      }

      const pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])

      if (pairings.length === 0) {
        return 0
      }

      await persistRound(tournament, roundNumber, category, null, pairings)

      return 1
    }

    case TournamentType.PLAYOFF:
    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      let created = 0

      if (roundNumber === 1 && !(await roundExists(tournament.id, 1, category, null))) {
        created += await createKnockoutBracket(tournament, category, null, competitorIds, 1)
      }

      // The consolation bracket is seeded once every competitor has played (and
      // possibly lost) their first real match — i.e. byes have played round 2.
      // It then starts at the current round, in parallel with the main bracket.
      // For PLAYOFF_WITH_CONSOLATION the consolation bracket is always enabled.
      if (tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION && roundNumber > 1) {
        const categoryRounds = await getCategoryRounds(tournament.id, category)
        const consolationExists = categoryRounds.some((round) => round.bracket === BRACKET_CONSOLATION)

        if (!consolationExists) {
          const { ready, losers } = await computeConsolationSeeds(tournament, category)

          if (ready && losers.length >= 2) {
            created += await createKnockoutBracket(tournament, category, BRACKET_CONSOLATION, losers, roundNumber)
          }
        }
      }

      return created
    }

    case TournamentType.GROUPS_PLAYOFF: {
      const groupPhaseRounds = getGroupPhaseRounds(settings, competitorIds.length)

      if (roundNumber <= groupPhaseRounds) {
        const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
        const groups = assignGroups(competitorIds, groupSize)
        let created = 0

        for (let index = 0; index < groups.length; index++) {
          const group = groups[index]

          if (group.length < 2 || roundNumber > roundRobinRoundsFor(group.length)) {
            continue
          }

          const bracket = groupBracket(index)

          if (await roundExists(tournament.id, roundNumber, category, bracket)) {
            continue
          }

          const pairings = generateRoundRobinRound(group, roundNumber)

          if (pairings.length === 0) {
            continue
          }

          await persistRound(tournament, roundNumber, category, bracket, pairings)
          created++
        }

        return created
      }

      // First knockout round: build the whole bracket from the group standings.
      if (roundNumber === groupPhaseRounds + 1) {
        if (await roundExists(tournament.id, roundNumber, category, BRACKET_PLAYOFF)) {
          return 0
        }

        const seeded = await computeGroupsKnockoutSeeds(tournament, category, competitorIds, settings)

        return createKnockoutBracket(tournament, category, BRACKET_PLAYOFF, seeded, groupPhaseRounds + 1)
      }

      return 0
    }
  }
}

/**
 * Creates the content of round `roundNumber` across every category. Returns how
 * many rounds were created (0 means nothing new — e.g. a knockout round whose
 * matches were already materialised up front).
 */
async function materializeRound(tournament: Tournament, roundNumber: number): Promise<number> {
  const competitors = await Competitor.where('tournamentId', tournament.id).orderBy('id').get()

  if (competitors.length < 2) {
    return 0
  }

  let created = 0

  for (const category of getTournamentCategoryKeys(tournament)) {
    const groupCompetitors = category === null ? competitors : competitors.filter((c) => c.category === category)
    const competitorIds = groupCompetitors.map((competitor) => competitor.id)

    if (competitorIds.length < 2) {
      continue
    }

    created += await materializeCategoryRound(tournament, roundNumber, category, competitorIds)
  }

  return created
}

/**
 * Generates and persists the first round of a tournament (and, for knockouts,
 * the whole bracket up to the final). Throws when no matches could be generated.
 */
export async function createRound(tournament: Tournament, roundNumber: number): Promise<void> {
  const competitors = await Competitor.where('tournamentId', tournament.id).get()

  if (competitors.length < 2) {
    throw new ApiException('notEnoughCompetitors')
  }

  const created = await materializeRound(tournament, roundNumber)

  if (created === 0 && roundNumber === 1) {
    throw new ApiException('noMatchesGenerated')
  }

  tournament.currentRound = roundNumber
  tournament.updatedAt = new Date()
  await tournament.save()

  // Resolve any round made entirely of byes/walkovers and advance accordingly.
  await closeRoundAndAdvance(tournament)
}

/** Whether any round exists at the given number (across categories/brackets). */
async function hasRoundAtNumber(tournamentId: number, roundNumber: number): Promise<boolean> {
  const rounds = await Round.where('tournamentId', tournamentId).where('number', roundNumber).get()

  return rounds.length > 0
}

/**
 * Closes the current round (every category/bracket sharing the round number)
 * once all its matches are resolved, then materialises and advances to the next
 * round. Loops so that rounds made entirely of byes/walkovers cascade through.
 *
 * The tournament is finished when, after closing a round, there is no next round
 * to play: nothing new was materialised and no round (e.g. a pre-built knockout
 * round) exists at the next number. This structural check naturally supports
 * variable-length structures like the consolation bracket, whose size depends on
 * how many competitors lose their first match.
 */
async function closeRoundAndAdvance(tournament: Tournament): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rounds = await Round.where('tournamentId', tournament.id)
      .where('number', tournament.currentRound)
      .with('matches')
      .get()
    const openRounds = rounds.filter((round) => round.status === RoundStatus.OPEN)

    if (openRounds.length === 0) {
      return
    }

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

    const nextNumber = tournament.currentRound + 1

    await materializeRound(tournament, nextNumber)

    if (!(await hasRoundAtNumber(tournament.id, nextNumber))) {
      tournament.status = TournamentStatus.FINISHED
      tournament.updatedAt = new Date()
      await tournament.save()

      return
    }

    tournament.currentRound = nextNumber
    tournament.updatedAt = new Date()
    await tournament.save()
  }
}

/**
 * Drives the whole tournament flow after a single result is saved or edited, so
 * organizers never have to close rounds or trigger the next ones by hand.
 *
 * - League / Americano: scores are reflected immediately and the next round is
 *   generated automatically once the last result of the round is loaded.
 * - Playoff (and groups+playoff knockout / consolation brackets): every result
 *   propagates the winners into the next bracket round (already materialised) so
 *   the upcoming rounds fill in live; the round closes and advances once all of
 *   its matches are resolved.
 * - Groups+playoff group phase: behaves like a league; when the last group
 *   match is loaded the knockout phase is seeded from the group standings.
 *
 * When the final round completes the tournament is marked as finished.
 */
export async function progressTournamentAfterResult(tournament: Tournament, round: Round): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  if (isKnockoutRound(tournament, round)) {
    await syncKnockoutNextRound(tournament, round)
  }

  await closeRoundAndAdvance(tournament)
}
