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
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
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
import { snakeSeedGroups, supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
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

/**
 * Returns true when a tournament is considered complete: every round is closed
 * and no match is still pending. Used by processTournaments to detect tournaments
 * that finished their last round but were never manually finalised.
 */
export async function isTournamentComplete(tournament: Tournament): Promise<boolean> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return false
  }

  const categories = await TournamentCategory.where('tournamentId', tournament.id).get()
  const categoryIds = categories.map((c) => c.id)

  if (categoryIds.length === 0) {
    return false
  }

  const rounds = await Round.whereIn('tournamentCategoryId', categoryIds).get()

  if (rounds.length === 0) {
    return false
  }

  // All rounds must be closed.
  if (rounds.some((r) => r.status !== RoundStatus.CLOSED)) {
    return false
  }

  const roundIds = rounds.map((r) => r.id)
  const matches = await Match.whereIn('roundId', roundIds).get()

  // No match can be pending.
  return !matches.some((m) => m.status === MatchStatus.PENDING)
}

/**
 * Category instances a tournament runs in parallel. Always at least one (the
 * single category with categoryId = null when the tournament has no categories).
 */
export async function getTournamentCategories(tournament: Tournament): Promise<TournamentCategory[]> {
  return TournamentCategory.where('tournamentId', tournament.id).orderBy('id').get()
}

/** Ids of the category instances of a tournament. */
async function getTournamentCategoryIds(tournament: Tournament): Promise<number[]> {
  const categories = await getTournamentCategories(tournament)

  return categories.map((category) => category.id)
}

/** All competitors of a tournament, across every category instance. */
export async function getTournamentCompetitors(tournament: Tournament): Promise<Competitor[]> {
  return Competitor.whereIn('tournamentCategoryId', await getTournamentCategoryIds(tournament))
    .orderBy('id')
    .get()
}

/**
 * Ordered competitor ids of a category instance. For bracket-style tournaments
 * that support preclassification, seeded competitors come first (seed 1 first),
 * then the rest in registration order, so byes go to the top seeds and the same
 * order is reproducible by every materialisation/seeding helper.
 */
async function getSortedCompetitorIds(tournament: Tournament, tournamentCategoryId: number): Promise<number[]> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const sorted = supportsPreclassification(tournament.type)
    ? [...competitors].sort((a, b) => {
        const sa = a.seedNumber ?? Infinity
        const sb = b.seedNumber ?? Infinity

        return sa !== sb ? sa - sb : a.id - b.id
      })
    : competitors

  return sorted.map((competitor) => competitor.id)
}

/**
 * Group membership of a groups+playoff category instance. Deterministic: seeded
 * competitors are snake-seeded across the groups (so seeds land in different
 * groups), the rest fill the remaining slots. Used both to materialise group
 * rounds and to reconstruct the groups when seeding the knockout, so ranking and
 * play always agree.
 */
async function computeCategoryGroups(
  tournamentCategoryId: number,
  competitorIds: number[],
  settings: Tournament['settings']
): Promise<number[][]> {
  const safeSettings = settings ?? {}
  const groupSize = safeSettings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
  const allCategoryCompetitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()
  const seededCount = allCategoryCompetitors.filter((competitor) => competitor.seedNumber != null).length
  const seededIds = competitorIds.slice(0, seededCount)
  const unseededIds = competitorIds.slice(seededCount)
  const groupCount = Math.ceil(competitorIds.length / Math.max(2, Math.floor(groupSize)))

  return seededCount > 0 ? snakeSeedGroups(seededIds, unseededIds, groupCount) : assignGroups(competitorIds, groupSize)
}

/** True when a round matches the given lane (type + group index). */
function isLane(round: Round, lane: RoundLane): boolean {
  return round.type === lane.type && (round.groupNumber ?? null) === (lane.groupNumber ?? null)
}

/** Distinct lanes (type + group index) that currently exist in a category instance. */
async function getCategoryLanes(tournamentCategoryId: number): Promise<RoundLane[]> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId).get()
  const lanes = new Map<string, RoundLane>()

  for (const round of rounds) {
    const lane: RoundLane = { type: round.type, groupNumber: round.groupNumber ?? null }

    lanes.set(`${lane.type}:${lane.groupNumber}`, lane)
  }

  return [...lanes.values()]
}

/** Whether a (category instance, lane) structure has any round at all. */
async function laneExists(tournamentCategoryId: number, lane: RoundLane): Promise<boolean> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId).get()

  return rounds.some((round) => isLane(round, lane))
}

/** Whether a lane already holds at least one real (non-bye) loaded result. */
async function laneHasResults(tournamentCategoryId: number, lane: RoundLane): Promise<boolean> {
  const rounds = await getBracketRounds(tournamentCategoryId, lane)
  const roundIds = rounds.map((round) => round.id)

  if (roundIds.length === 0) {
    return false
  }

  const matches = await Match.whereIn('roundId', roundIds).get()

  return matches.some((match) => match.awayCompetitorIds != null && match.status !== MatchStatus.PENDING)
}

/** Deletes the given rounds and all of their matches. */
async function deleteRounds(rounds: Round[]): Promise<void> {
  if (rounds.length === 0) {
    return
  }

  const roundIds = rounds.map((round) => round.id)
  const matches = await Match.whereIn('roundId', roundIds).get()

  for (const match of matches) {
    await match.delete()
  }

  for (const round of rounds) {
    await round.delete()
  }
}

/** Deletes an entire lane (every round + match of that category/lane). */
async function deleteLane(tournamentCategoryId: number, lane: RoundLane): Promise<void> {
  await deleteRounds(await getBracketRounds(tournamentCategoryId, lane))
}

/** All rounds of a single (category instance, lane) structure, ordered by number. */
async function getBracketRounds(tournamentCategoryId: number, lane: RoundLane): Promise<Round[]> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId).get()

  return rounds.filter((round) => isLane(round, lane)).sort((a, b) => a.number - b.number)
}

/** Whether a (category instance, lane) round already exists at the given number. */
async function roundExists(tournamentCategoryId: number, roundNumber: number, lane: RoundLane): Promise<boolean> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId).where('number', roundNumber).get()

  return rounds.some((round) => isLane(round, lane))
}

/** Persists a round and its matches from the given pairings. */
async function persistRound(
  tournamentCategoryId: number,
  roundNumber: number,
  lane: RoundLane,
  pairings: Pairing[]
): Promise<Round> {
  const round = new Round()

  round.tournamentCategoryId = tournamentCategoryId
  round.number = roundNumber
  round.status = RoundStatus.OPEN
  round.type = lane.type
  round.groupNumber = lane.groupNumber
  // Activeness is decided by setFrontier once the round number is materialised.
  round.active = false
  round.createdAt = new Date()
  await round.save()

  // Insert every match of the round in a single batch statement instead of one
  // INSERT per pairing.
  const now = new Date()
  const matchRows = pairings.map((pairing) => {
    // Byes (knockout only) are stored as already resolved in favor of "home".
    const isBye = pairing.away === null && pairing.home.length > 0

    return {
      tournamentCategoryId,
      roundId: round.id,
      position: pairing.position,
      homeCompetitorIds: pairing.home,
      awayCompetitorIds: pairing.away,
      score: null,
      status: isBye ? MatchStatus.WALKOVER : MatchStatus.PENDING,
      winner: isBye ? MatchSide.HOME : null,
      createdAt: now,
      updatedAt: now
    }
  })

  if (matchRows.length > 0) {
    await Match.insert(matchRows)
  }

  return round
}

/**
 * Marks the rounds with the given number as the tournament's active frontier
 * (active = true when open and at that number), deactivating every other round.
 * Replaces the former tournaments.currentRound counter: several rounds can be
 * active at once (groups, or a main + consolation bracket).
 */
async function setFrontier(tournamentCategoryIds: number[], roundNumber: number): Promise<void> {
  if (tournamentCategoryIds.length === 0) {
    return
  }

  // A round is active iff it is OPEN and sits at the frontier number. The result
  // is the same for every affected row, so two bulk UPDATEs replace the former
  // per-round save loop: deactivate everything, then activate the frontier.
  await Round.query()
    .whereIn('tournamentCategoryId', tournamentCategoryIds)
    .where('active', true)
    .update({ active: false })

  await Round.query()
    .whereIn('tournamentCategoryId', tournamentCategoryIds)
    .where('number', roundNumber)
    .where('status', RoundStatus.OPEN)
    .update({ active: true })
}

/**
 * Ends the editable grace window of the already-closed rounds of one lane that
 * sit below the given round number. Lane-scoped: entering a result in a lane only
 * locks that lane's earlier rounds, so other lanes (other groups, the other
 * bracket, other categories) keep their own independent windows.
 */
async function expireEditableWindow(tournamentCategoryId: number, lane: RoundLane, roundNumber: number): Promise<void> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId)
    .where('active', true)
    .where('status', RoundStatus.CLOSED)
    .where('number', '<', roundNumber)
    .get()

  for (const round of rounds) {
    if (isLane(round, lane)) {
      round.active = false
      await round.save()
    }
  }
}

/**
 * Locks every group-phase round of a category: once the knockout bracket has
 * received a result, group results can no longer be edited (they would change
 * the bracket seeding). Used as the cross-lane grace expiry of a groups+playoff.
 */
async function expireGroupPhaseWindows(tournamentCategoryId: number): Promise<void> {
  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId)
    .where('active', true)
    .where('status', RoundStatus.CLOSED)
    .get()

  for (const round of rounds) {
    if (round.type === RoundType.LEAGUE && round.groupNumber != null) {
      round.active = false
      await round.save()
    }
  }
}

/** Deactivates every round (used when the tournament finishes). */
async function deactivateAllRounds(tournamentCategoryIds: number[]): Promise<void> {
  if (tournamentCategoryIds.length === 0) {
    return
  }

  await Round.query()
    .whereIn('tournamentCategoryId', tournamentCategoryIds)
    .where('active', true)
    .update({ active: false })
}

/**
 * Deactivates every (grace-window) round of a tournament. Called by
 * finishTournament so that, once the tournament is finalised, no round is left
 * active/editable. The tournament is no longer finished automatically when its
 * last match is loaded — finalisation is now an explicit step (organizer action
 * or the processTournaments cron).
 */
export async function deactivateTournamentRounds(tournament: Tournament): Promise<void> {
  await deactivateAllRounds(await getTournamentCategoryIds(tournament))
}

/**
 * Creates a full knockout bracket up to the final: round 1 is seeded from
 * `seededIds` (top seeds get the byes) and every later round is materialised as
 * empty "to be defined" matches. Known winners (byes) are then propagated
 * forward so the bracket is coherent from the start. Returns 1 when a bracket
 * was created, 0 when there were not enough competitors.
 */
async function createKnockoutBracket(
  tournamentCategoryId: number,
  lane: RoundLane,
  seededIds: number[],
  startRound: number
): Promise<number> {
  if (seededIds.length < 2) {
    return 0
  }

  const bracketSize = getBracketSize(seededIds.length)
  const totalRounds = getKnockoutRounds(seededIds.length)

  await persistRound(tournamentCategoryId, startRound, lane, seedPlayoffPairings(seededIds))

  for (let roundIndex = 2; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = bracketSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: [], away: [], position })
    }

    await persistRound(tournamentCategoryId, startRound + roundIndex - 1, lane, placeholders)
  }

  // Propagate byes / already-known winners into the following rounds.
  const rounds = await getBracketRounds(tournamentCategoryId, lane)

  for (const round of rounds.slice(0, -1)) {
    await syncKnockoutNextRound(round)
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
async function syncKnockoutNextRound(currentRound: Round): Promise<void> {
  const currentMatches = await Match.where('roundId', currentRound.id).orderBy('position').get()

  // A single match means this is the final: there is no round beyond it.
  if (currentMatches.length <= 1) {
    return
  }

  const lane: RoundLane = { type: currentRound.type, groupNumber: currentRound.groupNumber ?? null }
  const nextNumber = currentRound.number + 1
  const bracketRounds = await getBracketRounds(currentRound.tournamentCategoryId, lane)
  let nextRound = bracketRounds.find((round) => round.number === nextNumber) ?? null

  if (!nextRound) {
    nextRound = new Round()
    nextRound.tournamentCategoryId = currentRound.tournamentCategoryId
    nextRound.number = nextNumber
    nextRound.status = RoundStatus.OPEN
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
      match.tournamentCategoryId = nextRound.tournamentCategoryId
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
async function computeConsolationSeeds(tournamentCategoryId: number): Promise<{ ready: boolean; losers: number[] }> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const mainLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }
  const mainRounds = await getBracketRounds(tournamentCategoryId, mainLane)
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
  tournamentCategoryId: number,
  competitorIds: number[],
  settings: Tournament['settings']
): Promise<number[]> {
  const safeSettings = settings ?? {}
  const qualifiersPerGroup = Math.max(
    1,
    safeSettings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
  )
  // Reconstruct the very same groups that were played (snake-seeded when there
  // are seeds) so the ranking is computed over the right competitors.
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)
  const allRounds = await getCategoryRounds(tournamentCategoryId)
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
 * True when a fixed-partner americano plays its complete round-robin (i.e. it is
 * not cut short by `maxRounds`). A complete americano is scheduled with the
 * circle method; only a truncated one uses standings-based pairing.
 */
function isFullAmericanoRoundRobin(settings: Tournament['settings'], competitorsCount: number): boolean {
  const maxRounds = settings?.maxRounds

  return maxRounds == null || maxRounds <= 0 || maxRounds >= roundRobinRoundsFor(competitorsCount)
}

/** Matches actually played per competitor (used to rotate the bye fairly). */
function countMatchesPlayed(competitorIds: number[], matches: Match[]): Map<number, number> {
  const played = new Map<number, number>(competitorIds.map((id) => [id, 0]))

  for (const match of matches) {
    if (match.awayCompetitorIds == null) {
      continue
    }

    for (const id of [...match.homeCompetitorIds, ...match.awayCompetitorIds]) {
      if (played.has(id)) {
        played.set(id, (played.get(id) ?? 0) + 1)
      }
    }
  }

  return played
}

/**
 * Finds a perfect matching of `ranked` (ordered best-first) that contains no
 * rematch, preferring opponents that are close in the standings. Returns null
 * when every remaining pairing would be a rematch (the schedule is exhausted).
 *
 * Backtracking keeps the greedy "closest opponent first" preference while
 * guaranteeing the round avoids every avoidable rematch — so an even field plays
 * a full single round-robin instead of replaying some pairs and skipping others.
 */
function findRematchFreeMatching(ranked: number[], matches: Match[]): [number, number][] | null {
  if (ranked.length === 0) {
    return []
  }

  const [first, ...rest] = ranked

  for (let i = 0; i < rest.length; i++) {
    if (havePlayedBefore(first, rest[i], matches)) {
      continue
    }

    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)]
    const sub = findRematchFreeMatching(remaining, matches)

    if (sub) {
      return [[first, rest[i]], ...sub]
    }
  }

  return null
}

/** Greedy fallback used only once the round-robin is exhausted (rematches allowed). */
function greedyMatching(ranked: number[], matches: Match[]): [number, number][] {
  const remaining = [...ranked]
  const pairs: [number, number][] = []

  while (remaining.length >= 2) {
    const first = remaining[0]
    let partnerIndex = remaining.findIndex((id, index) => index > 0 && !havePlayedBefore(first, id, matches))

    if (partnerIndex === -1) {
      partnerIndex = 1
    }

    pairs.push([first, remaining[partnerIndex]])
    remaining.splice(partnerIndex, 1)
    remaining.splice(0, 1)
  }

  return pairs
}

/**
 * Americano standings-based pairing. Competitors are ranked by current points
 * (descending) and the best-ranked players are paired with the closest-ranked
 * opponent they have not yet faced, so winners meet winners.
 *
 * Two fairness guarantees:
 *  - No avoidable rematch: while a rematch-free pairing of the field still
 *    exists it is used (an even field therefore plays a full round-robin).
 *  - Fair bye: with an odd field the competitor who has played the MOST matches
 *    so far (i.e. has had the fewest byes) sits out, ties broken by the lowest
 *    standing — so the bye rotates instead of always benching the weakest player.
 */
function generateAmericanoStandingsPairings(
  competitorIds: number[],
  allMatches: Match[],
  settings: Tournament['settings'],
  scoreFormat: number
): Pairing[] {
  const pts = computeAmericanoPoints(competitorIds, allMatches, settings, scoreFormat)
  let pool = [...competitorIds]

  if (pool.length % 2 === 1) {
    const played = countMatchesPlayed(competitorIds, allMatches)
    const byeId = [...pool].sort(
      (a, b) => (played.get(b) ?? 0) - (played.get(a) ?? 0) || (pts.get(a) ?? 0) - (pts.get(b) ?? 0) || a - b
    )[0]

    pool = pool.filter((id) => id !== byeId)
  }

  const ranked = [...pool].sort((a, b) => (pts.get(b) ?? 0) - (pts.get(a) ?? 0) || a - b)
  const pairs = findRematchFreeMatching(ranked, allMatches) ?? greedyMatching(ranked, allMatches)

  return pairs.map(([home, away], index) => ({ home: [home], away: [away], position: index }))
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

/** All rounds of a category instance (any lane). */
async function getCategoryRounds(tournamentCategoryId: number): Promise<Round[]> {
  return Round.where('tournamentCategoryId', tournamentCategoryId).get()
}

/**
 * Creates the matches of round `roundNumber` for a single category instance,
 * across every lane/phase that applies. Returns how many rounds were created.
 * Idempotent: skips (category instance, lane) rounds that already exist.
 */
async function materializeCategoryRound(
  tournament: Tournament,
  roundNumber: number,
  tournamentCategoryId: number,
  competitorIds: number[]
): Promise<number> {
  const settings = tournament.settings ?? {}

  switch (tournament.type) {
    case TournamentType.LEAGUE: {
      const lane: RoundLane = { type: RoundType.LEAGUE, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (await roundExists(tournamentCategoryId, roundNumber, lane)) {
        return 0
      }

      const pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])

      if (pairings.length === 0) {
        return 0
      }

      await persistRound(tournamentCategoryId, roundNumber, lane, pairings)

      return 1
    }

    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      const lane: RoundLane = { type: RoundType.AMERICANO, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (await roundExists(tournamentCategoryId, roundNumber, lane)) {
        return 0
      }

      let pairings: Pairing[]

      if (roundNumber === 1) {
        // First round: use default pairings (round-robin / swap circle method).
        pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])
      } else {
        // Subsequent rounds: pair by current standings, avoiding rematches.
        const categoryRounds = await getCategoryRounds(tournamentCategoryId)
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
        } else if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
          // A complete americano is a round-robin: schedule it with the circle
          // method so nobody plays a rematch while unplayed pairs remain and the
          // bye rotates fairly.
          pairings = generateRoundRobinRound(competitorIds, roundNumber)
        } else {
          // maxRounds-truncated americano: pair by current standings (winners vs
          // winners) since competitors will not face everyone anyway.
          pairings = generateAmericanoStandingsPairings(competitorIds, allMatches, settings, tournament.scoreFormat)
        }
      }

      if (pairings.length === 0) {
        return 0
      }

      await persistRound(tournamentCategoryId, roundNumber, lane, pairings)

      return 1
    }

    case TournamentType.PLAYOFF:

    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      const mainLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }
      const consolationLane: RoundLane = { type: RoundType.KNOCKOUT_CONSOLATION, groupNumber: null }
      let created = 0

      if (roundNumber === 1 && !(await roundExists(tournamentCategoryId, 1, mainLane))) {
        created += await createKnockoutBracket(tournamentCategoryId, mainLane, competitorIds, 1)
      }

      // The consolation bracket is seeded once every competitor has played (and
      // possibly lost) their first real match — i.e. byes have played round 2.
      // It then starts at the current round, in parallel with the main bracket.
      // For PLAYOFF_WITH_CONSOLATION the consolation bracket is always enabled.
      if (tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION && roundNumber > 1) {
        const categoryRounds = await getCategoryRounds(tournamentCategoryId)
        const consolationExists = categoryRounds.some((round) => round.type === RoundType.KNOCKOUT_CONSOLATION)

        if (!consolationExists) {
          const { ready, losers } = await computeConsolationSeeds(tournamentCategoryId)

          if (ready && losers.length >= 2) {
            created += await createKnockoutBracket(tournamentCategoryId, consolationLane, losers, roundNumber)
          }
        }
      }

      return created
    }

    case TournamentType.GROUPS_PLAYOFF: {
      const groupPhaseRounds = getGroupPhaseRounds(settings, competitorIds.length)

      if (roundNumber <= groupPhaseRounds) {
        const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)
        let created = 0

        for (let index = 0; index < groups.length; index++) {
          const group = groups[index]

          if (group.length < 2 || roundNumber > roundRobinRoundsFor(group.length)) {
            continue
          }

          const lane: RoundLane = { type: RoundType.LEAGUE, groupNumber: index }

          if (await roundExists(tournamentCategoryId, roundNumber, lane)) {
            continue
          }

          const pairings = generateRoundRobinRound(group, roundNumber)

          if (pairings.length === 0) {
            continue
          }

          await persistRound(tournamentCategoryId, roundNumber, lane, pairings)
          created++
        }

        return created
      }

      // First knockout round: build the whole bracket from the group standings.
      if (roundNumber === groupPhaseRounds + 1) {
        const knockoutLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }

        if (await roundExists(tournamentCategoryId, roundNumber, knockoutLane)) {
          return 0
        }

        // A single group is just a league — skip the knockout (it would only
        // replay the group). Its standings decide the result.
        const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)

        if (groups.filter((group) => group.length > 0).length <= 1) {
          return 0
        }

        const seeded = await computeGroupsKnockoutSeeds(tournamentCategoryId, competitorIds, settings)

        return createKnockoutBracket(tournamentCategoryId, knockoutLane, seeded, groupPhaseRounds + 1)
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
  const categories = await getTournamentCategories(tournament)
  const competitors = await Competitor.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  )
    .orderBy('id')
    .get()

  if (competitors.length < 2) {
    return 0
  }

  // For bracket-style tournaments that support preclassification, order
  // competitors so that seeded players come first (seed 1 first), followed by
  // unseeded competitors in registration order. This makes the bracket engine
  // give byes to the top seeds and keep them apart until late rounds.
  const sortedCompetitors = supportsPreclassification(tournament.type)
    ? [...competitors].sort((a, b) => {
        const sa = a.seedNumber ?? Infinity
        const sb = b.seedNumber ?? Infinity

        if (sa !== sb) {
          return sa - sb
        }

        return a.id - b.id
      })
    : competitors
  let created = 0

  for (const tournamentCategory of categories) {
    const competitorIds = sortedCompetitors
      .filter((competitor) => competitor.tournamentCategoryId === tournamentCategory.id)
      .map((competitor) => competitor.id)

    if (competitorIds.length < 2) {
      continue
    }

    created += await materializeCategoryRound(tournament, roundNumber, tournamentCategory.id, competitorIds)
  }

  return created
}

/**
 * Generates and persists the first round of a tournament (and, for knockouts,
 * the whole bracket up to the final). Throws when no matches could be generated.
 */
export async function createRound(tournament: Tournament, roundNumber: number): Promise<void> {
  const competitors = await getTournamentCompetitors(tournament)

  if (competitors.length < 2) {
    throw new ApiException('notEnoughCompetitors')
  }

  const created = await materializeRound(tournament, roundNumber)

  if (created === 0 && roundNumber === 1) {
    throw new ApiException('noMatchesGenerated')
  }

  await setFrontier(await getTournamentCategoryIds(tournament), roundNumber)
  tournament.updatedAt = new Date()
  await tournament.save()

  // Resolve any round made entirely of byes/walkovers and advance accordingly.
  await advanceTournament(tournament)
}

/**
 * Builds (or finds) the next round of a single lane, returning it ready to be
 * activated, or null when the lane has no further round.
 *
 * Knockout lanes are materialised up front, so "next" already exists or the
 * bracket is over. League / americano / group lanes create their next round on
 * demand: leagues and groups follow a fixed round-robin schedule, while americano
 * pairings are recomputed from the current standings.
 */
async function buildLaneNextRound(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  nextNumber: number,
  competitorIds: number[]
): Promise<Round | null> {
  const settings = tournament.settings ?? {}
  const laneRounds = await getBracketRounds(tournamentCategoryId, lane)
  const existing = laneRounds.find((round) => round.number === nextNumber)

  if (existing) {
    return existing
  }

  // Knockout brackets are fully pre-built; a missing round means the lane is done.
  if (isKnockoutType(lane.type)) {
    return null
  }

  // Group lane of a groups+playoff tournament (round robin inside the group).
  if (lane.groupNumber != null) {
    const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)
    const group = groups[lane.groupNumber] ?? []

    if (group.length < 2 || nextNumber > roundRobinRoundsFor(group.length)) {
      return null
    }

    const pairings = generateRoundRobinRound(group, nextNumber)

    return pairings.length > 0 ? persistRound(tournamentCategoryId, nextNumber, lane, pairings) : null
  }

  // Plain league / americano lane.
  if (nextNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
    return null
  }

  let pairings: Pairing[]

  if (tournament.type === TournamentType.AMERICANO || tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
    const roundIds = laneRounds.map((round) => round.id)
    const allMatches = roundIds.length > 0 ? await Match.whereIn('roundId', roundIds).get() : []

    if (tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
      pairings = generateAmericanoSwapStandingsPairings(
        competitorIds,
        nextNumber,
        allMatches,
        settings,
        tournament.scoreFormat
      )
    } else if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
      // Full americano → clean circle-method round-robin (see materializeCategoryRound).
      pairings = generateRoundRobinRound(competitorIds, nextNumber)
    } else {
      pairings = generateAmericanoStandingsPairings(competitorIds, allMatches, settings, tournament.scoreFormat)
    }
  } else {
    pairings = generateRoundPairings(tournament.type, settings, competitorIds, nextNumber, [])
  }

  return pairings.length > 0 ? persistRound(tournamentCategoryId, nextNumber, lane, pairings) : null
}

/**
 * Advances a single lane independently of every other lane. When the lane's
 * frontier (its highest-numbered active round) is OPEN and fully resolved, it is
 * closed and the lane's next round is created/activated. The closed round is kept
 * active as an editable grace window while it holds a real matchup. Returns true
 * when it changed something (so the driver loop knows to keep going).
 */
async function advanceLane(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  competitorIds: number[]
): Promise<boolean> {
  const laneRounds = await getBracketRounds(tournamentCategoryId, lane)
  const activeRounds = laneRounds.filter((round) => round.active)

  if (activeRounds.length === 0) {
    return false
  }

  // The frontier is the highest-numbered active round. A CLOSED active round is a
  // grace window already advanced past, so only an OPEN frontier can advance.
  const frontier = activeRounds[activeRounds.length - 1]

  if (frontier.status !== RoundStatus.OPEN) {
    return false
  }

  const matches = await Match.where('roundId', frontier.id).get()

  if (matches.some((match) => match.status === MatchStatus.PENDING)) {
    return false
  }

  // Close the frontier; keep it editable (active) as a grace window only while it
  // holds a real matchup — bye-only rounds have nothing to fix.
  frontier.status = RoundStatus.CLOSED
  frontier.active = matches.some((match) => match.awayCompetitorIds != null)
  await frontier.save()

  const next = await buildLaneNextRound(tournament, tournamentCategoryId, lane, frontier.number + 1, competitorIds)

  if (next) {
    next.active = true
    await next.save()
  }

  return true
}

/**
 * Groups+playoff join: once EVERY group of a category has played all its
 * round-robin rounds with no pending match, builds and activates the knockout
 * bracket seeded from the final group standings. No-op until then, or if the
 * bracket already exists. Returns true when the bracket was created.
 */
async function maybeStartGroupsKnockout(
  tournament: Tournament,
  tournamentCategoryId: number,
  competitorIds: number[]
): Promise<boolean> {
  if (tournament.type !== TournamentType.GROUPS_PLAYOFF) {
    return false
  }

  const knockoutLane: RoundLane = { type: RoundType.KNOCKOUT, groupNumber: null }

  if (await laneExists(tournamentCategoryId, knockoutLane)) {
    return false
  }

  const settings = tournament.settings ?? {}
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)

  // With a single group there is nothing to cross-seed: a knockout would only
  // replay the group it came from. The group standings decide the result
  // instead (getPodiumCompetitorIds falls back to them).
  if (groups.filter((group) => group.length > 0).length <= 1) {
    return false
  }

  const rounds = await Round.where('tournamentCategoryId', tournamentCategoryId).with('matches').get()

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length < 2) {
      continue
    }

    const groupRounds = rounds.filter(
      (round) => round.type === RoundType.LEAGUE && (round.groupNumber ?? null) === index
    )

    // The group must have materialised all of its rounds and resolved them all.
    if (groupRounds.length < roundRobinRoundsFor(group.length)) {
      return false
    }

    if (groupRounds.some((round) => (round.matches ?? []).some((match) => match.status === MatchStatus.PENDING))) {
      return false
    }
  }

  const seeded = await computeGroupsKnockoutSeeds(tournamentCategoryId, competitorIds, settings)
  const startNumber = getGroupPhaseRounds(settings, competitorIds.length) + 1
  const created = await createKnockoutBracket(tournamentCategoryId, knockoutLane, seeded, startNumber)

  if (created === 0) {
    return false
  }

  const knockoutRounds = await getBracketRounds(tournamentCategoryId, knockoutLane)

  if (knockoutRounds.length > 0) {
    knockoutRounds[0].active = true
    await knockoutRounds[0].save()
  }

  return true
}

/**
 * Playoff-with-consolation join: once every competitor has played (and possibly
 * lost) their first real match, builds and activates the consolation bracket from
 * the first-round losers. Runs on its own schedule, independent of how far the
 * main bracket has progressed. Returns true when the bracket was created.
 */
async function maybeStartConsolation(tournament: Tournament, tournamentCategoryId: number): Promise<boolean> {
  if (tournament.type !== TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return false
  }

  const consolationLane: RoundLane = { type: RoundType.KNOCKOUT_CONSOLATION, groupNumber: null }

  if (await laneExists(tournamentCategoryId, consolationLane)) {
    return false
  }

  const { ready, losers } = await computeConsolationSeeds(tournamentCategoryId)

  if (!ready || losers.length < 2) {
    return false
  }

  // The consolation entrants are the round-1 losers, so it starts at number 2.
  const created = await createKnockoutBracket(tournamentCategoryId, consolationLane, losers, 2)

  if (created === 0) {
    return false
  }

  const consolationRounds = await getBracketRounds(tournamentCategoryId, consolationLane)

  if (consolationRounds.length > 0) {
    consolationRounds[0].active = true
    await consolationRounds[0].save()
  }

  return true
}

/**
 * Drives the whole tournament forward after a result is saved/edited. Every lane
 * — each category, each group of the group phase, the main and consolation
 * brackets — advances on its own schedule, so one can be in the semifinals while
 * another is still in the round of 16, and a round of one lane never waits for
 * another. Group phases reconverge into the knockout only once ALL groups of the
 * category are done. Loops until nothing else can move, cascading bye-only rounds
 * and freshly-unlocked joins.
 */
async function advanceTournament(tournament: Tournament): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  const categories = await getTournamentCategories(tournament)
  let progressed = true

  while (progressed) {
    progressed = false

    for (const category of categories) {
      const competitorIds = await getSortedCompetitorIds(tournament, category.id)

      if (competitorIds.length < 2) {
        continue
      }

      // 1. Advance every existing lane independently.
      for (const lane of await getCategoryLanes(category.id)) {
        if (await advanceLane(tournament, category.id, lane, competitorIds)) {
          progressed = true
        }
      }

      // 2. Cross-lane joins (groups → knockout, and the consolation bracket).
      if (await maybeStartGroupsKnockout(tournament, category.id, competitorIds)) {
        progressed = true
      }

      if (await maybeStartConsolation(tournament, category.id)) {
        progressed = true
      }
    }
  }

  // NOTE: the tournament is intentionally NOT finished here anymore. Loading the
  // last match leaves it ONGOING so a wrong final result can still be corrected.
  // Finalisation happens explicitly via finishTournament (organizer button) or
  // the processTournaments cron once isTournamentComplete() is true.
}

/**
 * Deletes a lane from `fromNumber` onward and rebuilds its next round from the
 * corrected data, leaving it active. Used to regenerate a standings-dependent
 * round after a result is edited in its (still-resultless) predecessor.
 */
async function rebuildLaneFrom(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  fromNumber: number
): Promise<void> {
  const laneRounds = await getBracketRounds(tournamentCategoryId, lane)
  const toDelete = laneRounds.filter((round) => round.number >= fromNumber)

  if (toDelete.length === 0) {
    return
  }

  await deleteRounds(toDelete)

  const competitorIds = await getSortedCompetitorIds(tournament, tournamentCategoryId)
  const next = await buildLaneNextRound(tournament, tournamentCategoryId, lane, fromNumber, competitorIds)

  if (next) {
    next.active = true
    await next.save()
  }
}

/**
 * After a result is edited in an already-closed round (during its grace window),
 * rebuilds the downstream structures derived from it so a competitor that
 * advanced by mistake is corrected. Always safe because a closed round is only
 * editable while its dependent structure has not yet received any result.
 *
 * - League / group phase: round-robin schedules are fixed, so nothing to rebuild
 *   beyond what the knockout join recomputes.
 * - Americano: the next round's pairings depend on the standings → regenerate it.
 * - Groups+playoff group edit: drop the knockout bracket; advanceTournament
 *   reseeds it from the corrected group standings.
 * - Playoff with consolation main-bracket edit: drop the still-resultless
 *   consolation bracket; advanceTournament reseeds it from the corrected losers.
 * - Knockout winner propagation is handled by syncKnockoutNextRound.
 */
async function regenerateDownstreamRounds(tournament: Tournament, editedRound: Round): Promise<void> {
  switch (tournament.type) {
    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      const lane: RoundLane = { type: RoundType.AMERICANO, groupNumber: null }

      await rebuildLaneFrom(tournament, editedRound.tournamentCategoryId, lane, editedRound.number + 1)
      break
    }

    case TournamentType.GROUPS_PLAYOFF: {
      // A group-phase edit can change who qualifies → drop the knockout so it is
      // reseeded. Only reachable while the knockout holds no results yet.
      if (editedRound.type === RoundType.LEAGUE && editedRound.groupNumber != null) {
        await deleteLane(editedRound.tournamentCategoryId, { type: RoundType.KNOCKOUT, groupNumber: null })
      }

      break
    }

    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      // A main-bracket edit can change who drops to the consolation bracket. Only
      // reseed it when it exists and has not started yet (never clobber results).
      if (editedRound.type === RoundType.KNOCKOUT) {
        const consolationLane: RoundLane = { type: RoundType.KNOCKOUT_CONSOLATION, groupNumber: null }

        if (
          (await laneExists(editedRound.tournamentCategoryId, consolationLane)) &&
          !(await laneHasResults(editedRound.tournamentCategoryId, consolationLane))
        ) {
          await deleteLane(editedRound.tournamentCategoryId, consolationLane)
        }
      }

      break
    }

    default:
      // LEAGUE / PLAYOFF: nothing extra; syncKnockoutNextRound handles brackets.
      break
  }
}

/**
 * Entry point after a single result is saved or edited. Propagates knockout
 * winners, rebuilds any structure derived from an edited closed round, advances
 * every lane independently, and finally expires the editable grace windows that
 * this result has locked.
 */
export async function progressTournamentAfterResult(tournament: Tournament, round: Round): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  const lane: RoundLane = { type: round.type, groupNumber: round.groupNumber ?? null }
  // A CLOSED round here means a correction made during its grace window.
  const isEditOfClosedRound = round.status === RoundStatus.CLOSED

  if (isKnockoutType(round.type)) {
    await syncKnockoutNextRound(round)
  }

  if (isEditOfClosedRound) {
    await regenerateDownstreamRounds(tournament, round)
  }

  await advanceTournament(tournament)

  // Entering a result ends the grace window of earlier closed rounds of the SAME
  // lane. In a groups+playoff, a knockout result additionally locks every
  // group-phase round (they can no longer change the bracket seeding).
  await expireEditableWindow(round.tournamentCategoryId, lane, round.number)

  if (tournament.type === TournamentType.GROUPS_PLAYOFF && round.type === RoundType.KNOCKOUT) {
    await expireGroupPhaseWindows(round.tournamentCategoryId)
  }
}
