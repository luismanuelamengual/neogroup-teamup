import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { isKnockoutType, RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  assignGroups,
  generateAmericanoSwapRoundRobin,
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
import { getGamesWon, getSetsWon, parseScore } from '@/app/(protected)/(tournaments)/utils/score'
import { ApiException } from '@/app/models/ApiException'

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/** A round "lane": the parallel structure a round belongs to inside its category. */
interface RoundLane {
  type: RoundType
  groupNumber: number | null
}

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
 * ids, or `[null]` (a single group) when the tournament has no categories.
 */
export function getTournamentCategoryKeys(tournament: Tournament): (number | null)[] {
  return tournament.categoryIds && tournament.categoryIds.length > 0 ? tournament.categoryIds : [null]
}

/** True when a round matches the given lane (type + group index). */
function isLane(round: Round, lane: RoundLane): boolean {
  return round.type === lane.type && (round.groupNumber ?? null) === (lane.groupNumber ?? null)
}

/** All rounds of a single (category, lane) structure, ordered by number. */
async function getBracketRounds(tournamentId: number, categoryId: number | null, lane: RoundLane): Promise<Round[]> {
  const rounds = await Round.where('tournamentId', tournamentId).get()

  return rounds
    .filter((round) => (round.categoryId ?? null) === (categoryId ?? null) && isLane(round, lane))
    .sort((a, b) => a.number - b.number)
}

/** Whether a (category, lane) round already exists at the given number. */
async function roundExists(
  tournamentId: number,
  roundNumber: number,
  categoryId: number | null,
  lane: RoundLane
): Promise<boolean> {
  const rounds = await Round.where('tournamentId', tournamentId).where('number', roundNumber).get()

  return rounds.some((round) => (round.categoryId ?? null) === (categoryId ?? null) && isLane(round, lane))
}

/** Persists a round and its matches from the given pairings. */
async function persistRound(
  tournament: Tournament,
  roundNumber: number,
  categoryId: number | null,
  lane: RoundLane,
  pairings: Pairing[]
): Promise<Round> {
  const round = new Round()

  round.tournamentId = tournament.id
  round.number = roundNumber
  round.status = RoundStatus.OPEN
  round.categoryId = categoryId
  round.type = lane.type
  round.groupNumber = lane.groupNumber
  // Activeness is decided by setFrontier once the round number is materialised.
  round.active = false
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
 * Marks the rounds with the given number as the tournament's active frontier
 * (active = true when open and at that number), deactivating every other round.
 * Replaces the former tournaments.currentRound counter: several rounds can be
 * active at once (groups, or a main + consolation bracket).
 */
async function setFrontier(tournamentId: number, roundNumber: number): Promise<void> {
  const rounds = await Round.where('tournamentId', tournamentId).get()

  for (const round of rounds) {
    const shouldBeActive = round.status === RoundStatus.OPEN && round.number === roundNumber

    if (round.active !== shouldBeActive) {
      round.active = shouldBeActive
      await round.save()
    }
  }
}

/** Deactivates every round (used when the tournament finishes). */
async function deactivateAllRounds(tournamentId: number): Promise<void> {
  const rounds = await Round.where('tournamentId', tournamentId).where('active', true).get()

  for (const round of rounds) {
    round.active = false
    await round.save()
  }
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
  categoryId: number | null,
  lane: RoundLane,
  seededIds: number[],
  startRound: number
): Promise<number> {
  if (seededIds.length < 2) {
    return 0
  }

  const bracketSize = getBracketSize(seededIds.length)
  const totalRounds = getKnockoutRounds(seededIds.length)

  await persistRound(tournament, startRound, categoryId, lane, seedPlayoffPairings(seededIds))

  for (let roundIndex = 2; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = bracketSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: [], away: [], position })
    }

    await persistRound(tournament, startRound + roundIndex - 1, categoryId, lane, placeholders)
  }

  // Propagate byes / already-known winners into the following rounds.
  const rounds = await getBracketRounds(tournament.id, categoryId, lane)

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

  const lane: RoundLane = { type: currentRound.type, groupNumber: currentRound.groupNumber ?? null }
  const nextNumber = currentRound.number + 1
  const bracketRounds = await getBracketRounds(tournament.id, currentRound.categoryId ?? null, lane)
  let nextRound = bracketRounds.find((round) => round.number === nextNumber) ?? null

  if (!nextRound) {
    nextRound = new Round()
    nextRound.tournamentId = tournament.id
    nextRound.number = nextNumber
    nextRound.status = RoundStatus.OPEN
    nextRound.categoryId = currentRound.categoryId
    nextRound.type = currentRound.type
    nextRound.groupNumber = currentRound.groupNumber
    nextRound.active = false
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
  categoryId: number | null
): Promise<{ ready: boolean; losers: number[] }> {
  const competitors = (await Competitor.where('tournamentId', tournament.id).orderBy('id').get()).filter(
    (competitor) => categoryId == null || competitor.categoryId === categoryId
  )
  const mainLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }
  const mainRounds = await getBracketRounds(tournament.id, categoryId, mainLane)
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
function rankGroup(competitorIds: number[], matches: Match[], settings?: Tournament['settings']): number[] {
  const groupsDefaults = DEFAULT_GROUPS_PLAYOFF_SETTINGS
  const league = {
    pointsPerPresent: settings?.pointsPerPresent ?? groupsDefaults.pointsPerPresent,
    pointsPerSetWon: settings?.pointsPerSetWon ?? groupsDefaults.pointsPerSetWon,
    pointsPerMatchWon: settings?.pointsPerMatchWon ?? groupsDefaults.pointsPerMatchWon
  }
  const stats = new Map(
    competitorIds.map((id) => [id, { points: 0, won: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 }])
  )

  const add = (
    ids: number[] | null,
    updater: (row: {
      points: number
      won: number
      setsWon: number
      setsLost: number
      gamesWon: number
      gamesLost: number
    }) => void
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

    const score = parseScore(match.score) ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)

    add(match.homeCompetitorIds, (row) => {
      row.setsWon += sets.home
      row.setsLost += sets.away
      row.points += sets.home * league.pointsPerSetWon

      if (!isWalkover || score.walkover === MatchSide.HOME) {
        row.points += league.pointsPerPresent
      }

      if (match.winner === MatchSide.HOME) {
        row.won++
        row.points += league.pointsPerMatchWon
      }
    })
    add(match.awayCompetitorIds, (row) => {
      row.setsWon += sets.away
      row.setsLost += sets.home
      row.points += sets.away * league.pointsPerSetWon

      if (!isWalkover || score.walkover === MatchSide.AWAY) {
        row.points += league.pointsPerPresent
      }

      if (match.winner === MatchSide.AWAY) {
        row.won++
        row.points += league.pointsPerMatchWon
      }
    })
  }

  /** Returns 1 if idA beat idB, -1 if idB beat idA, 0 otherwise. */
  const headToHead = (idA: number, idB: number): number => {
    for (const match of matches) {
      if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
        continue
      }

      const homeHasA = match.homeCompetitorIds.includes(idA)
      const homeHasB = match.homeCompetitorIds.includes(idB)
      const awayHasA = match.awayCompetitorIds.includes(idA)
      const awayHasB = match.awayCompetitorIds.includes(idB)

      if ((homeHasA && awayHasB) || (homeHasB && awayHasA)) {
        if (match.winner === MatchSide.HOME) {
          return homeHasA ? 1 : -1
        }

        if (match.winner === MatchSide.AWAY) {
          return awayHasA ? 1 : -1
        }
      }
    }

    return 0
  }

  return [...competitorIds].sort((a, b) => {
    const rowA = stats.get(a)!
    const rowB = stats.get(b)!

    if (rowB.points !== rowA.points) {
      return rowB.points - rowA.points
    }

    const setDiffA = rowA.setsWon - rowA.setsLost
    const setDiffB = rowB.setsWon - rowB.setsLost

    if (setDiffB !== setDiffA) {
      return setDiffB - setDiffA
    }

    const gameDiffA = rowA.gamesWon - rowA.gamesLost
    const gameDiffB = rowB.gamesWon - rowB.gamesLost

    if (gameDiffB !== gameDiffA) {
      return gameDiffB - gameDiffA
    }

    return headToHead(b, a)
  })
}

/**
 * Computes the cross-seeded knockout lineup from the final group standings of a
 * groups+playoff category.
 */
async function computeGroupsKnockoutSeeds(
  tournament: Tournament,
  categoryId: number | null,
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
  const allRounds = await getCategoryRounds(tournament.id, categoryId)
  const qualifiers: number[][] = []

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length === 0) {
      continue
    }

    const roundIds = allRounds
      .filter((round) => round.type === RoundType.LEAGUE && (round.groupNumber ?? null) === index)
      .map((round) => round.id)
    const matches = roundIds.length > 0 ? await Match.whereIn('roundId', roundIds).get() : []
    const ranked = rankGroup(group, matches, settings)

    qualifiers.push(ranked.slice(0, Math.min(qualifiersPerGroup, group.length)))
  }

  return seedFromGroups(qualifiers)
}

/**
 * Computes points per competitor from a list of resolved matches using the
 * Americano scoring formula (games won × pointsPerGameWon + wins × pointsPerMatchWon).
 */
function computeAmericanoPoints(
  competitorIds: number[],
  matches: Match[],
  settings: Tournament['settings'],
  scoreFormat: number
): Map<number, number> {
  const americano = { ...DEFAULT_AMERICANO_SETTINGS, ...(settings ?? {}) }
  const pts = new Map(competitorIds.map((id) => [id, 0]))

  for (const match of matches) {
    if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
      continue
    }

    const score = parseScore(match.score) ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const games = isWalkover ? { home: 0, away: 0 } : getGamesWon(score, scoreFormat)

    for (const id of match.homeCompetitorIds) {
      pts.set(id, (pts.get(id) ?? 0) + games.home * americano.pointsPerGameWon)

      if (match.winner === MatchSide.HOME) {
        pts.set(id, (pts.get(id) ?? 0) + americano.pointsPerMatchWon)
      }
    }

    for (const id of match.awayCompetitorIds) {
      pts.set(id, (pts.get(id) ?? 0) + games.away * americano.pointsPerGameWon)

      if (match.winner === MatchSide.AWAY) {
        pts.set(id, (pts.get(id) ?? 0) + americano.pointsPerMatchWon)
      }
    }
  }

  return pts
}

/** Returns true when two competitors have already faced each other in any of the given matches. */
function havePlayedBefore(idA: number, idB: number, matches: Match[]): boolean {
  return matches.some(
    (match) =>
      match.awayCompetitorIds != null &&
      ((match.homeCompetitorIds.includes(idA) && match.awayCompetitorIds.includes(idB)) ||
        (match.homeCompetitorIds.includes(idB) && match.awayCompetitorIds.includes(idA)))
  )
}

/**
 * Americano standings-based pairing. Competitors are sorted by current points
 * (descending). The top competitor is paired with the highest-ranked opponent
 * they have not yet faced. Falls back to already-played opponents when no new
 * one is available.
 */
function generateAmericanoStandingsPairings(
  competitorIds: number[],
  allMatches: Match[],
  settings: Tournament['settings'],
  scoreFormat: number
): Pairing[] {
  const pts = computeAmericanoPoints(competitorIds, allMatches, settings, scoreFormat)
  const sorted = [...competitorIds].sort((a, b) => (pts.get(b) ?? 0) - (pts.get(a) ?? 0))
  const remaining = [...sorted]
  const pairings: Pairing[] = []
  let position = 0

  while (remaining.length >= 2) {
    const first = remaining[0]
    // Find the best-ranked opponent who hasn't faced `first` yet.
    let partnerIndex = -1

    for (let i = 1; i < remaining.length; i++) {
      if (!havePlayedBefore(first, remaining[i], allMatches)) {
        partnerIndex = i
        break
      }
    }

    // If everyone has already been faced, just take the next-ranked player.
    if (partnerIndex === -1) {
      partnerIndex = 1
    }

    const second = remaining[partnerIndex]

    pairings.push({ home: [first], away: [second], position: position++ })
    remaining.splice(partnerIndex, 1)
    remaining.splice(0, 1)
  }

  return pairings
}

/**
 * Americano-with-swap standings-based pairing. Partners are still assigned via
 * the circle-method (ensuring partner diversity across rounds), but the resulting
 * teams are sorted by combined points before being matched as opponents so that
 * the best teams face each other.
 */
function generateAmericanoSwapStandingsPairings(
  competitorIds: number[],
  roundNumber: number,
  allMatches: Match[],
  settings: Tournament['settings'],
  scoreFormat: number
): Pairing[] {
  // Build partnerships using the classic circle method.
  const swapPairings = generateAmericanoSwapRoundRobin(competitorIds, roundNumber)

  if (swapPairings.length === 0) {
    return []
  }

  const pts = computeAmericanoPoints(competitorIds, allMatches, settings, scoreFormat)
  // Sort teams by combined points (descending).
  const teams = swapPairings.flatMap((p) => [p.home, p.away]).filter((t): t is number[] => t != null)
  const sortedTeams = [...teams].sort((a, b) => {
    const sumA = a.reduce((s, id) => s + (pts.get(id) ?? 0), 0)
    const sumB = b.reduce((s, id) => s + (pts.get(id) ?? 0), 0)

    return sumB - sumA
  })
  // Pair consecutive sorted teams (best vs 2nd, 3rd vs 4th, …).
  const pairings: Pairing[] = []

  for (let i = 0; i + 1 < sortedTeams.length; i += 2) {
    pairings.push({ home: sortedTeams[i], away: sortedTeams[i + 1], position: i / 2 })
  }

  return pairings
}

/** All rounds of a category (any lane). */
async function getCategoryRounds(tournamentId: number, categoryId: number | null): Promise<Round[]> {
  const rounds = await Round.where('tournamentId', tournamentId).get()

  return rounds.filter((round) => (round.categoryId ?? null) === (categoryId ?? null))
}

/**
 * Creates the matches of round `roundNumber` for a single category, across every
 * lane/phase that applies. Returns how many rounds were created. Idempotent:
 * skips (category, lane) rounds that already exist.
 */
async function materializeCategoryRound(
  tournament: Tournament,
  roundNumber: number,
  categoryId: number | null,
  competitorIds: number[]
): Promise<number> {
  const settings = tournament.settings ?? {}

  switch (tournament.type) {
    case TournamentType.LEAGUE: {
      const lane: RoundLane = { type: RoundType.LEAGUE, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (await roundExists(tournament.id, roundNumber, categoryId, lane)) {
        return 0
      }

      const pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])

      if (pairings.length === 0) {
        return 0
      }

      await persistRound(tournament, roundNumber, categoryId, lane, pairings)

      return 1
    }

    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      const lane: RoundLane = { type: RoundType.AMERICANO, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (await roundExists(tournament.id, roundNumber, categoryId, lane)) {
        return 0
      }

      let pairings: Pairing[]

      if (roundNumber === 1) {
        // First round: use default pairings (round-robin / swap circle method).
        pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])
      } else {
        // Subsequent rounds: pair by current standings, avoiding rematches.
        const categoryRounds = await getCategoryRounds(tournament.id, categoryId)
        const roundIds = categoryRounds.map((r) => r.id)
        const allMatches = roundIds.length > 0 ? await Match.whereIn('roundId', roundIds).get() : []

        if (tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
          pairings = generateAmericanoSwapStandingsPairings(
            competitorIds,
            roundNumber,
            allMatches,
            settings,
            tournament.scoreFormat
          )
        } else {
          pairings = generateAmericanoStandingsPairings(competitorIds, allMatches, settings, tournament.scoreFormat)
        }
      }

      if (pairings.length === 0) {
        return 0
      }

      await persistRound(tournament, roundNumber, categoryId, lane, pairings)

      return 1
    }

    case TournamentType.PLAYOFF:

    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      const mainLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }
      const consolationLane: RoundLane = { type: RoundType.KNOCKOUT_CONSOLATION, groupNumber: null }
      let created = 0

      if (roundNumber === 1 && !(await roundExists(tournament.id, 1, categoryId, mainLane))) {
        created += await createKnockoutBracket(tournament, categoryId, mainLane, competitorIds, 1)
      }

      // The consolation bracket is seeded once every competitor has played (and
      // possibly lost) their first real match — i.e. byes have played round 2.
      // It then starts at the current round, in parallel with the main bracket.
      // For PLAYOFF_WITH_CONSOLATION the consolation bracket is always enabled.
      if (tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION && roundNumber > 1) {
        const categoryRounds = await getCategoryRounds(tournament.id, categoryId)
        const consolationExists = categoryRounds.some((round) => round.type === RoundType.KNOCKOUT_CONSOLATION)

        if (!consolationExists) {
          const { ready, losers } = await computeConsolationSeeds(tournament, categoryId)

          if (ready && losers.length >= 2) {
            created += await createKnockoutBracket(tournament, categoryId, consolationLane, losers, roundNumber)
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

          const lane: RoundLane = { type: RoundType.LEAGUE, groupNumber: index }

          if (await roundExists(tournament.id, roundNumber, categoryId, lane)) {
            continue
          }

          const pairings = generateRoundRobinRound(group, roundNumber)

          if (pairings.length === 0) {
            continue
          }

          await persistRound(tournament, roundNumber, categoryId, lane, pairings)
          created++
        }

        return created
      }

      // First knockout round: build the whole bracket from the group standings.
      if (roundNumber === groupPhaseRounds + 1) {
        const knockoutLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }

        if (await roundExists(tournament.id, roundNumber, categoryId, knockoutLane)) {
          return 0
        }

        const seeded = await computeGroupsKnockoutSeeds(tournament, categoryId, competitorIds, settings)

        return createKnockoutBracket(tournament, categoryId, knockoutLane, seeded, groupPhaseRounds + 1)
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

  for (const categoryId of getTournamentCategoryKeys(tournament)) {
    const groupCompetitors =
      categoryId === null ? competitors : competitors.filter((c) => c.categoryId === categoryId)
    const competitorIds = groupCompetitors.map((competitor) => competitor.id)

    if (competitorIds.length < 2) {
      continue
    }

    created += await materializeCategoryRound(tournament, roundNumber, categoryId, competitorIds)
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

  await setFrontier(tournament.id, roundNumber)
  tournament.updatedAt = new Date()
  await tournament.save()

  // Resolve any round made entirely of byes/walkovers and advance accordingly.
  await closeRoundAndAdvance(tournament)
}

/** Whether any round exists at the given number (across categories/lanes). */
async function hasRoundAtNumber(tournamentId: number, roundNumber: number): Promise<boolean> {
  const rounds = await Round.where('tournamentId', tournamentId).where('number', roundNumber).get()

  return rounds.length > 0
}

/**
 * Closes the active frontier (every category/lane sharing the active round
 * number) once all its matches are resolved, then materialises and activates the
 * next round. Loops so that rounds made entirely of byes/walkovers cascade
 * through.
 *
 * The tournament is finished when, after closing the frontier, there is no next
 * round to play: nothing new was materialised and no round (e.g. a pre-built
 * knockout round) exists at the next number. This structural check naturally
 * supports variable-length structures like the consolation bracket, whose size
 * depends on how many competitors lose their first match.
 */
async function closeRoundAndAdvance(tournament: Tournament): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const activeRounds = await Round.where('tournamentId', tournament.id).where('active', true).with('matches').get()

    if (activeRounds.length === 0) {
      return
    }

    const currentNumber = Math.max(...activeRounds.map((round) => round.number))
    const frontierRounds = activeRounds.filter((round) => round.number === currentNumber)
    const hasPending = frontierRounds.some((round) =>
      (round.matches ?? []).some((match) => match.status === MatchStatus.PENDING)
    )

    if (hasPending) {
      return
    }

    for (const round of frontierRounds) {
      round.status = RoundStatus.CLOSED
      round.active = false
      await round.save()
    }

    const nextNumber = currentNumber + 1

    await materializeRound(tournament, nextNumber)

    if (!(await hasRoundAtNumber(tournament.id, nextNumber))) {
      tournament.status = TournamentStatus.FINISHED
      tournament.updatedAt = new Date()
      await tournament.save()
      await deactivateAllRounds(tournament.id)

      return
    }

    await setFrontier(tournament.id, nextNumber)
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

  if (isKnockoutType(round.type)) {
    await syncKnockoutNextRound(tournament, round)
  }

  await closeRoundAndAdvance(tournament)
}
