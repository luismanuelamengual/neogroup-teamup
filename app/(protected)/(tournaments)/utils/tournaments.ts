import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType, MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { snakeSeedGroups, supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
import { getGamesWon, getSetsWon, parseScore } from '@/app/(protected)/(tournaments)/utils/score'
import { ApiException } from '@/app/models/ApiException'
import { Organization } from '@/app/models/Organization'

/**
 * Pure functions that compute the pairings of every tournament round.
 * Competitors are referenced by id. A side holds one competitor id, except in
 * americano tournaments with partner swapping where two individual competitors
 * team up for the round.
 */

export interface Pairing {
  home: number[]
  away: number[] | null
  position: number
}

/** Round-robin rounds needed for `size` competitors (circle method). */
function roundRobinRoundsFor(size: number): number {
  if (size < 2) {
    return 0
  }

  return size % 2 === 0 ? size - 1 : size
}

/** Knockout rounds (to the final) needed for `entrants` competitors. */
export function getKnockoutRounds(entrants: number): number {
  return entrants < 2 ? 0 : Math.ceil(Math.log2(entrants))
}

/** Power-of-two bracket size that fits `entrants` (min 2). */
export function getBracketSize(entrants: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(entrants, 2))))
}

/**
 * Balanced group sizes for `competitorsCount` competitors targeting
 * `groupSize` per group. The number of groups is derived from the registered
 * competitors (ceil division); the remainder is spread across the first groups.
 */
export function computeGroupSizes(competitorsCount: number, groupSize: number): number[] {
  const safeGroupSize = Math.max(2, Math.floor(groupSize) || 2)
  const groupCount = Math.max(1, Math.ceil(competitorsCount / safeGroupSize))
  const base = Math.floor(competitorsCount / groupCount)
  const remainder = competitorsCount % groupCount

  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Distributes competitor ids into balanced groups (round-robin assignment, so
 * groups end up as even as possible). Deterministic: the same ordered input
 * always yields the same groups.
 */
export function assignGroups(competitorIds: number[], groupSize: number): number[][] {
  const groupCount = computeGroupSizes(competitorIds.length, groupSize).length
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  competitorIds.forEach((id, index) => {
    groups[index % groupCount].push(id)
  })

  return groups
}

/**
 * Cross-seeds the knockout phase of a groups+playoff tournament. `qualifiers`
 * is ordered per group (index 0 is the group winner). Returns a flat seeded
 * lineup where every rank tier is grouped together (all winners first, then all
 * runners-up, ...). Fed to the standard bracket seeding this makes group
 * winners earn the byes and keeps competitors from the same group apart in the
 * first round.
 */
export function seedFromGroups(qualifiers: number[][]): number[] {
  const maxRank = qualifiers.reduce((max, group) => Math.max(max, group.length), 0)
  const seeded: number[] = []

  for (let rank = 0; rank < maxRank; rank++) {
    for (const group of qualifiers) {
      if (group[rank] !== undefined) {
        seeded.push(group[rank])
      }
    }
  }

  return seeded
}

/** Total number of rounds for a tournament given its competitors count. */
export function getTotalRounds(type: TournamentType, settings: TournamentSettings, competitorsCount: number): number {
  if (competitorsCount < 2) {
    return 0
  }

  switch (type) {
    case TournamentType.LEAGUE:
      return roundRobinRoundsFor(competitorsCount)

    case TournamentType.AMERICANO: {
      const totalRounds = roundRobinRoundsFor(competitorsCount)
      const maxRounds = settings.maxRounds

      return maxRounds != null && maxRounds > 0 ? Math.min(totalRounds, maxRounds) : totalRounds
    }

    case TournamentType.AMERICANO_WITH_SWAP: {
      // Individuals rotate partners: one round per circle-method rotation.
      const slots = competitorsCount % 2 === 0 ? competitorsCount : competitorsCount + 1
      const totalRounds = slots - 1
      const maxRounds = settings.maxRounds

      return maxRounds != null && maxRounds > 0 ? Math.min(totalRounds, maxRounds) : totalRounds
    }

    case TournamentType.PLAYOFF:
    case TournamentType.PLAYOFF_WITH_CONSOLATION:
      // A consolation bracket runs in parallel with the main one and finishes
      // on the same round, so it does not add rounds.
      return getKnockoutRounds(competitorsCount)

    case TournamentType.GROUPS_PLAYOFF: {
      const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
      const qualifiers = settings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
      const sizes = computeGroupSizes(competitorsCount, groupSize)
      const groupRounds = sizes.reduce((max, size) => Math.max(max, roundRobinRoundsFor(size)), 0)
      const totalQualifiers = sizes.reduce((sum, size) => sum + Math.min(Math.max(1, qualifiers), size), 0)

      return groupRounds + getKnockoutRounds(totalQualifiers)
    }
  }
}

/**
 * Maximum number of rounds across every category group. When a tournament has
 * categories each one runs in parallel and they may have different sizes, so
 * the tournament lasts as long as its largest group.
 */
export function getMaxTotalRounds(type: TournamentType, settings: TournamentSettings, groupSizes: number[]): number {
  return groupSizes.reduce((max, size) => Math.max(max, getTotalRounds(type, settings, size)), 0)
}

/** Group-phase rounds of a groups+playoff category (round-robin, largest group). */
export function getGroupPhaseRounds(settings: TournamentSettings, competitorsCount: number): number {
  const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup

  return computeGroupSizes(competitorsCount, groupSize).reduce(
    (max, size) => Math.max(max, roundRobinRoundsFor(size)),
    0
  )
}

/**
 * Circle-method round robin. Returns the pairs for a 1-based round number.
 * With an odd number of participants a null "bye" slot is added; pairs that
 * include the bye are skipped.
 */
function roundRobinPairs(ids: number[], roundNumber: number): [number | null, number | null][] {
  const slots: (number | null)[] = [...ids]

  if (slots.length % 2 !== 0) {
    slots.push(null)
  }

  const count = slots.length
  const fixed = slots[0]
  const rotating = slots.slice(1)
  const rotation = (roundNumber - 1) % (count - 1)
  const rotated = [...rotating.slice(rotation), ...rotating.slice(0, rotation)]
  const lineup = [fixed, ...rotated]
  const pairs: [number | null, number | null][] = []

  for (let i = 0; i < count / 2; i++) {
    pairs.push([lineup[i], lineup[count - 1 - i]])
  }

  return pairs
}

/** League and fixed-pairs americano: classic round robin between competitors. */
export function generateRoundRobinRound(competitorIds: number[], roundNumber: number): Pairing[] {
  const pairs = roundRobinPairs(competitorIds, roundNumber)
  const pairings: Pairing[] = []
  let position = 0

  for (const [home, away] of pairs) {
    if (home == null || away == null) {
      continue
    }

    pairings.push({ home: [home], away: [away], position: position++ })
  }

  return pairings
}

/**
 * Americano with partner swapping: individuals are paired with a different
 * partner each round (circle method) and the resulting teams are matched
 * sequentially. With an odd team count the last team rests.
 */
export function generateAmericanoSwapRoundRobin(competitorIds: number[], roundNumber: number): Pairing[] {
  const partnerships = roundRobinPairs(competitorIds, roundNumber).filter(
    (pair): pair is [number, number] => pair[0] != null && pair[1] != null
  )
  const pairings: Pairing[] = []
  let position = 0

  for (let i = 0; i + 1 < partnerships.length; i += 2) {
    pairings.push({
      home: [partnerships[i][0], partnerships[i][1]],
      away: [partnerships[i + 1][0], partnerships[i + 1][1]],
      position: position++
    })
  }

  return pairings
}

/**
 * First-round pairings of a knockout bracket. Competitors are seeded in the
 * given order over the next power of two, giving byes to the top seeds.
 * Bye matches (away === null) must be persisted as already played, won by home.
 */
export function seedPlayoffPairings(competitorIds: number[]): Pairing[] {
  const bracketSize = getBracketSize(competitorIds.length)
  const seeds: (number | null)[] = new Array(bracketSize).fill(null)

  competitorIds.forEach((id, index) => {
    seeds[index] = id
  })

  const order = buildBracketOrder(bracketSize)
  const pairings: Pairing[] = []

  for (let i = 0; i < bracketSize / 2; i++) {
    const home = seeds[order[i * 2]]
    const away = seeds[order[i * 2 + 1]]

    if (home == null && away == null) {
      continue
    }

    pairings.push({
      home: [home ?? (away as number)],
      away: home == null ? null : away == null ? null : [away],
      position: i
    })
  }

  return pairings
}

/** Winners of `previousRoundMatches`, paired up into the next bracket round. */
export function advancePlayoffPairings(previousRoundMatches: Match[]): Pairing[] {
  const sorted = [...previousRoundMatches].sort((a, b) => a.position - b.position)
  const winners = sorted.map((match) => {
    if (match.winner === MatchSide.HOME) {
      return match.homeCompetitorIds[0]
    }

    if (match.winner === MatchSide.AWAY && match.awayCompetitorIds) {
      return match.awayCompetitorIds[0]
    }

    return null
  })
  const pairings: Pairing[] = []

  for (let i = 0; i + 1 < winners.length; i += 2) {
    const home = winners[i]
    const away = winners[i + 1]

    if (home == null && away == null) {
      continue
    }

    pairings.push({
      home: [home ?? (away as number)],
      away: home == null || away == null ? null : [away],
      position: i / 2
    })
  }

  return pairings
}

/**
 * Playoff bracket. Round 1 seeds competitors in registration order over the
 * next power of two, giving byes to the top seeds. Later rounds pair the
 * winners of the two previous matches at adjacent bracket positions.
 */
function generatePlayoffRound(competitorIds: number[], roundNumber: number, previousRoundMatches: Match[]): Pairing[] {
  return roundNumber === 1 ? seedPlayoffPairings(competitorIds) : advancePlayoffPairings(previousRoundMatches)
}

/**
 * Standard bracket seeding order (1 vs lowest seed, etc.) so the best seeds
 * can only meet in late rounds. Returns seed indexes (0-based).
 */
function buildBracketOrder(bracketSize: number): number[] {
  let order = [0]

  while (order.length < bracketSize) {
    const next: number[] = []
    const size = order.length * 2

    for (const seed of order) {
      next.push(seed)
      next.push(size - 1 - seed)
    }

    order = next
  }

  return order
}

/** Computes the pairings for the given (1-based) round of a tournament. */
export function generateRoundPairings(
  type: TournamentType,
  settings: TournamentSettings,
  competitorIds: number[],
  roundNumber: number,
  previousRoundMatches: Match[]
): Pairing[] {
  switch (type) {
    case TournamentType.LEAGUE:
      return generateRoundRobinRound(competitorIds, roundNumber)

    case TournamentType.AMERICANO:
      return generateRoundRobinRound(competitorIds, roundNumber)

    case TournamentType.AMERICANO_WITH_SWAP:
      return generateAmericanoSwapRoundRobin(competitorIds, roundNumber)

    case TournamentType.PLAYOFF:
    case TournamentType.PLAYOFF_WITH_CONSOLATION:
      return generatePlayoffRound(competitorIds, roundNumber, previousRoundMatches)

    case TournamentType.GROUPS_PLAYOFF:
      // Groups+playoff rounds are generated bracket-by-bracket by the helpers.
      return []
  }
}

/** Helpers shared by the /api/tournaments/[id]/* route handlers. */

/**
 * A lane: the parallel structure a match belongs to inside its category,
 * identified by its type (BRACKET / LEAGUE / CONSOLATION_BRACKET) plus the
 * optional group index. The former `rounds` table is gone — a lane is just the
 * set of matches that share this (type, groupNumber) pair, sliced into rounds by
 * `roundNumber`.
 */
interface RoundLane {
  type: MatchType
  groupNumber: number | null
}

/** True when a match belongs to the given lane (type + group index). */
function isLaneMatch(match: Match, lane: RoundLane): boolean {
  return match.type === lane.type && (match.groupNumber ?? null) === (lane.groupNumber ?? null)
}

/**
 * Per-run, per-category snapshot cache used while advancing a tournament.
 *
 * `advanceTournament` scans every lane of every category repeatedly. This cache
 * loads each category's matches and competitors ONCE and serves the repeated
 * scans from memory. Competitors never change during advancement, so they are
 * cached for the whole run; matches are invalidated whenever a write changes a
 * category's structure, so the next read reloads fresh state.
 *
 * It is created fresh for each advance run and threaded explicitly (never a
 * module global), so concurrent requests never share state.
 */
class AdvanceCache {
  private matchesByCategory = new Map<number, Match[]>()
  private competitorsByCategory = new Map<number, Competitor[]>()

  /** All matches of a category. */
  async matches(tournamentCategoryId: number): Promise<Match[]> {
    let matches = this.matchesByCategory.get(tournamentCategoryId)

    if (!matches) {
      matches = await Match.where('tournamentCategoryId', tournamentCategoryId).get()
      this.matchesByCategory.set(tournamentCategoryId, matches)
    }

    return matches
  }

  /** Competitors of a category, ordered by id (cached for the whole run). */
  async competitors(tournamentCategoryId: number): Promise<Competitor[]> {
    let competitors = this.competitorsByCategory.get(tournamentCategoryId)

    if (!competitors) {
      competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
      this.competitorsByCategory.set(tournamentCategoryId, competitors)
    }

    return competitors
  }

  /** Drops the cached matches of a category after a structural write. */
  invalidate(tournamentCategoryId: number): void {
    this.matchesByCategory.delete(tournamentCategoryId)
  }
}

/** Matches of a category, from the cache when present, else straight from the DB. */
async function loadCategoryMatches(tournamentCategoryId: number, cache?: AdvanceCache): Promise<Match[]> {
  return cache ? cache.matches(tournamentCategoryId) : Match.where('tournamentCategoryId', tournamentCategoryId).get()
}

/** Matches of a single lane, sorted by round then bracket position. */
function laneMatches(matches: Match[], lane: RoundLane): Match[] {
  return matches
    .filter((match) => isLaneMatch(match, lane))
    .sort((a, b) => a.roundNumber - b.roundNumber || a.position - b.position)
}

/** Matches of a single (lane, round) slice, sorted by bracket position. */
function roundMatchesOf(matches: Match[], lane: RoundLane, roundNumber: number): Match[] {
  return matches
    .filter((match) => isLaneMatch(match, lane) && match.roundNumber === roundNumber)
    .sort((a, b) => a.position - b.position)
}

/** Distinct round numbers present in a lane, ascending. */
function laneRoundNumbers(matches: Match[], lane: RoundLane): number[] {
  return [...new Set(laneMatches(matches, lane).map((match) => match.roundNumber))].sort((a, b) => a - b)
}

/** Distinct lanes (type + group index) that currently exist in a category. */
function getCategoryLanes(matches: Match[]): RoundLane[] {
  const lanes = new Map<string, RoundLane>()

  for (const match of matches) {
    const lane: RoundLane = { type: match.type, groupNumber: match.groupNumber ?? null }

    lanes.set(`${lane.type}:${lane.groupNumber}`, lane)
  }

  return [...lanes.values()]
}

/** Whether a lane has any match at all. */
function laneExistsIn(matches: Match[], lane: RoundLane): boolean {
  return matches.some((match) => isLaneMatch(match, lane))
}

/** Whether a lane already holds at least one real (non-bye) resolved result. */
function laneHasResultsIn(matches: Match[], lane: RoundLane): boolean {
  return matches.some(
    (match) => isLaneMatch(match, lane) && match.awayCompetitorIds != null && match.status !== MatchStatus.PENDING
  )
}

/** Whether a (lane, round) slice already exists. */
function roundExistsIn(matches: Match[], lane: RoundLane, roundNumber: number): boolean {
  return roundMatchesOf(matches, lane, roundNumber).length > 0
}

/** Deletes the given matches. Callers delete whole lanes, so no dangling refs remain. */
async function deleteMatches(matches: Match[]): Promise<void> {
  for (const match of matches) {
    await match.delete()
  }
}

/** Deletes an entire lane (every match of that category/lane). */
async function deleteLane(tournamentCategoryId: number, lane: RoundLane): Promise<void> {
  const matches = await loadCategoryMatches(tournamentCategoryId)

  await deleteMatches(laneMatches(matches, lane))
}

/**
 * Returns true when a tournament is considered complete: no match is still
 * pending. A pending match is either a real matchup awaiting a result or a
 * not-yet-reached knockout placeholder, so "nothing pending" means every lane
 * has been played to its end. Used by processTournaments to detect tournaments
 * that finished their last match but were never manually finalised.
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

  const matches = await Match.whereIn('tournamentCategoryId', categoryIds).get()

  if (matches.length === 0) {
    return false
  }

  return !matches.some((match) => match.status === MatchStatus.PENDING)
}

/**
 * Category instances a tournament runs in parallel. Always at least one (the
 * single category with categoryId = null when the tournament has no categories).
 */
export async function getTournamentCategories(tournament: Tournament): Promise<TournamentCategory[]> {
  return TournamentCategory.where('tournamentId', tournament.id).orderBy('id').get()
}

/**
 * Materialises the category instances (tournament_categories) of a tournament.
 * When `categoryIds` is provided it creates one instance per catalogue category;
 * otherwise it creates a single instance with categoryId = null (the "single
 * category"). Every instance shares the same `maxCompetitors` entry limit.
 * Returns the created instances.
 */
export async function createTournamentCategories(
  tournamentId: number,
  categoryIds: number[] | null,
  maxCompetitors: number
): Promise<TournamentCategory[]> {
  const ids: (number | null)[] = categoryIds && categoryIds.length > 0 ? categoryIds : [null]
  const created: TournamentCategory[] = []

  for (const categoryId of ids) {
    const tournamentCategory = new TournamentCategory()

    tournamentCategory.tournamentId = tournamentId
    tournamentCategory.categoryId = categoryId
    tournamentCategory.maxCompetitors = maxCompetitors
    await tournamentCategory.save()
    created.push(tournamentCategory)
  }

  return created
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
async function getSortedCompetitorIds(
  tournament: Tournament,
  tournamentCategoryId: number,
  cache?: AdvanceCache
): Promise<number[]> {
  const competitors = cache
    ? await cache.competitors(tournamentCategoryId)
    : await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
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
  settings: Tournament['settings'],
  cache?: AdvanceCache
): Promise<number[][]> {
  const safeSettings = settings ?? {}
  const groupSize = safeSettings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
  const allCategoryCompetitors = cache
    ? await cache.competitors(tournamentCategoryId)
    : await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()
  const seededCount = allCategoryCompetitors.filter((competitor) => competitor.seedNumber != null).length
  const seededIds = competitorIds.slice(0, seededCount)
  const unseededIds = competitorIds.slice(seededCount)
  const groupSizes = computeGroupSizes(competitorIds.length, groupSize)

  return seededCount > 0 ? snakeSeedGroups(seededIds, unseededIds, groupSizes) : assignGroups(competitorIds, groupSize)
}

/**
 * Persists a round of a lane (its matches) from the given pairings. Returns them.
 * `bracketInstance` is the knockout stage counted from the final (1 = Final,
 * 2 = Semifinal, …) and is null for round-robin lanes.
 */
async function persistRoundMatches(
  tournamentCategoryId: number,
  roundNumber: number,
  lane: RoundLane,
  pairings: Pairing[],
  bracketInstance: number | null = null
): Promise<Match[]> {
  if (pairings.length === 0) {
    return []
  }

  const now = new Date()
  const rows = pairings.map((pairing) => {
    // Byes (knockout only) are stored as already resolved in favor of "home".
    const isBye = pairing.away === null && pairing.home.length > 0

    return {
      tournamentCategoryId,
      roundNumber,
      type: lane.type,
      groupNumber: lane.groupNumber,
      position: pairing.position,
      bracketInstance,
      homeCompetitorIds: pairing.home,
      awayCompetitorIds: pairing.away,
      score: null,
      status: isBye ? MatchStatus.WALKOVER : MatchStatus.PENDING,
      winner: isBye ? MatchSide.HOME : null,
      createdAt: now,
      updatedAt: now
    }
  })

  await Match.insert(rows)

  const all = await Match.where('tournamentCategoryId', tournamentCategoryId).get()

  return roundMatchesOf(all, lane, roundNumber)
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

/** True when two competitor-id lists hold the same ids in the same order. */
function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Knockout: keeps the next bracket round in sync with the winners known so far.
 * The next round already exists (materialised up front), so each still-pending
 * next-round match is refreshed with the current winners. Matches that already
 * hold a result are never overwritten. The feeder at bracket 2p feeds the home
 * side of the parent at bracket p, and 2p+1 feeds its away side (the parity that
 * the derived next-match/editability relies on). Returns true when it changed anything.
 */
async function syncKnockoutNextRound(
  tournamentCategoryId: number,
  lane: RoundLane,
  roundNumber: number,
  cache?: AdvanceCache
): Promise<boolean> {
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const current = roundMatchesOf(all, lane, roundNumber)

  // A single match means this is the final: there is no round beyond it.
  if (current.length <= 1) {
    return false
  }

  const next = roundMatchesOf(all, lane, roundNumber + 1)

  if (next.length === 0) {
    return false
  }

  const currentByBracket = new Map(current.map((match) => [match.position, match]))
  let changed = false

  for (const target of next) {
    // Don't touch a next-round match that already holds its own result.
    if (target.status !== MatchStatus.PENDING) {
      continue
    }

    const homeFeeder = currentByBracket.get(target.position * 2) ?? null
    const awayFeeder = currentByBracket.get(target.position * 2 + 1) ?? null
    const homeIds = homeFeeder ? (matchWinnerIds(homeFeeder) ?? []) : []
    const awayIds = awayFeeder ? (matchWinnerIds(awayFeeder) ?? []) : []

    if (sameIds(target.homeCompetitorIds, homeIds) && sameIds(target.awayCompetitorIds ?? [], awayIds)) {
      continue
    }

    target.homeCompetitorIds = homeIds
    target.awayCompetitorIds = awayIds
    target.updatedAt = new Date()
    await target.save()
    changed = true
  }

  if (changed) {
    cache?.invalidate(tournamentCategoryId)
  }

  return changed
}

/**
 * Creates a full knockout bracket up to the final: round `startRound` is seeded
 * from `seededIds` (top seeds get the byes) and every later round is materialised
 * as empty "to be defined" matches. Each round is tagged with its bracket instance
 * (Final = 1, Semifinal = 2, …) and known winners (byes) are propagated forward so
 * the bracket is coherent from the start.
 * Returns 1 when a bracket was created, 0 when there were not enough competitors.
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

  // The first knockout round is the furthest from the final: instance = totalRounds
  // (e.g. 3 for an 8-player bracket: Cuartos). Each later round is one closer, so the
  // final (last round) is instance 1.
  await persistRoundMatches(tournamentCategoryId, startRound, lane, seedPlayoffPairings(seededIds), totalRounds)

  for (let roundIndex = 2; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = bracketSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: [], away: [], position })
    }

    await persistRoundMatches(
      tournamentCategoryId,
      startRound + roundIndex - 1,
      lane,
      placeholders,
      totalRounds - roundIndex + 1
    )
  }

  // Propagate byes / already-known winners into the following rounds.
  const roundNumbers = laneRoundNumbers(await loadCategoryMatches(tournamentCategoryId), lane)

  for (const roundNumber of roundNumbers.slice(0, -1)) {
    await syncKnockoutNextRound(tournamentCategoryId, lane, roundNumber)
  }

  return 1
}

/**
 * Computes the entrants of the consolation bracket: every competitor that lost
 * their FIRST real match in the main bracket. A bye (away === null) is not a
 * real match, so competitors who advanced on a bye are only considered once they
 * play (and lose) their actual first match — which happens in round 2.
 *
 * Returns `ready: false` while any competitor still has an unresolved first real
 * match, so the consolation bracket is only built once every entrant is known.
 */
async function computeConsolationSeeds(
  tournamentCategoryId: number,
  cache?: AdvanceCache
): Promise<{ ready: boolean; losers: number[] }> {
  const competitors = cache
    ? await cache.competitors(tournamentCategoryId)
    : await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const mainLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  // Real matches (an actual opponent) ordered by round then bracket position.
  const realMatches = laneMatches(all, mainLane)
    .filter((match) => match.awayCompetitorIds && match.awayCompetitorIds.length > 0)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.position - b.position)
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
  settings: Tournament['settings'],
  cache?: AdvanceCache
): Promise<number[]> {
  const safeSettings = settings ?? {}
  const qualifiersPerGroup = Math.max(
    1,
    safeSettings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
  )
  // Reconstruct the very same groups that were played (snake-seeded when there
  // are seeds) so the ranking is computed over the right competitors.
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache)
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const qualifiers: number[][] = []

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length === 0) {
      continue
    }

    const groupMatches = all.filter((match) => match.type === MatchType.LEAGUE && (match.groupNumber ?? null) === index)
    const ranked = rankGroup(group, groupMatches, settings)

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
  const swapPairings = generateAmericanoSwapRoundRobin(competitorIds, roundNumber)

  if (swapPairings.length === 0) {
    return []
  }

  const pts = computeAmericanoPoints(competitorIds, allMatches, settings, scoreFormat)
  const teams = swapPairings.flatMap((p) => [p.home, p.away]).filter((t): t is number[] => t != null)
  const sortedTeams = [...teams].sort((a, b) => {
    const sumA = a.reduce((s, id) => s + (pts.get(id) ?? 0), 0)
    const sumB = b.reduce((s, id) => s + (pts.get(id) ?? 0), 0)

    return sumB - sumA
  })
  const pairings: Pairing[] = []

  for (let i = 0; i + 1 < sortedTeams.length; i += 2) {
    pairings.push({ home: sortedTeams[i], away: sortedTeams[i + 1], position: i / 2 })
  }

  return pairings
}

/**
 * Creates the matches of round `roundNumber` for a single category instance,
 * across every lane/phase that applies. Returns how many rounds were created.
 * Idempotent: skips (lane, round) slices that already exist.
 */
async function materializeCategoryRound(
  tournament: Tournament,
  roundNumber: number,
  tournamentCategoryId: number,
  competitorIds: number[]
): Promise<number> {
  const settings = tournament.settings ?? {}
  const all = await loadCategoryMatches(tournamentCategoryId)

  switch (tournament.type) {
    case TournamentType.LEAGUE: {
      const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (roundExistsIn(all, lane, roundNumber)) {
        return 0
      }

      const pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])

      if (pairings.length === 0) {
        return 0
      }

      await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)

      return 1
    }

    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: null }

      if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
        return 0
      }

      if (roundExistsIn(all, lane, roundNumber)) {
        return 0
      }

      let pairings: Pairing[]

      if (roundNumber === 1) {
        pairings = generateRoundPairings(tournament.type, settings, competitorIds, roundNumber, [])
      } else {
        const allMatches = laneMatches(all, lane)

        if (tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
          pairings = generateAmericanoSwapStandingsPairings(
            competitorIds,
            roundNumber,
            allMatches,
            settings,
            tournament.scoreFormat
          )
        } else if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
          pairings = generateRoundRobinRound(competitorIds, roundNumber)
        } else {
          pairings = generateAmericanoStandingsPairings(competitorIds, allMatches, settings, tournament.scoreFormat)
        }
      }

      if (pairings.length === 0) {
        return 0
      }

      await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)

      return 1
    }

    case TournamentType.PLAYOFF:

    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      const mainLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }
      let created = 0

      if (roundNumber === 1 && !roundExistsIn(all, mainLane, 1)) {
        created += await createKnockoutBracket(tournamentCategoryId, mainLane, competitorIds, 1)
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

          const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: index }

          if (roundExistsIn(all, lane, roundNumber)) {
            continue
          }

          const pairings = generateRoundRobinRound(group, roundNumber)

          if (pairings.length === 0) {
            continue
          }

          await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)
          created++
        }

        return created
      }

      // First knockout round: build the whole bracket from the group standings.
      if (roundNumber === groupPhaseRounds + 1) {
        const knockoutLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }

        if (roundExistsIn(all, knockoutLane, roundNumber)) {
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
 * many rounds were created (0 means nothing new).
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

  tournament.updatedAt = new Date()
  await tournament.save()

  // Resolve any round made entirely of byes/walkovers and advance accordingly.
  await advanceTournament(tournament)
}

/**
 * Builds (or finds) the next round of a single lane, returning its matches ready
 * to play, or null when the lane has no further round.
 *
 * Knockout lanes are materialised up front, so "next" already exists or the
 * bracket is over. League / americano / group lanes create their next round on
 * demand.
 */
async function buildLaneNextRound(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  nextNumber: number,
  competitorIds: number[],
  cache?: AdvanceCache
): Promise<Match[] | null> {
  const settings = tournament.settings ?? {}
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const existing = roundMatchesOf(all, lane, nextNumber)

  if (existing.length > 0) {
    return existing
  }

  // Knockout brackets are fully pre-built; a missing round means the lane is done.
  if (isKnockoutType(lane.type)) {
    return null
  }

  // Group lane of a groups+playoff tournament (round robin inside the group).
  if (lane.groupNumber != null) {
    const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache)
    const group = groups[lane.groupNumber] ?? []

    if (group.length < 2 || nextNumber > roundRobinRoundsFor(group.length)) {
      return null
    }

    const pairings = generateRoundRobinRound(group, nextNumber)

    return pairings.length > 0 ? persistRoundMatches(tournamentCategoryId, nextNumber, lane, pairings) : null
  }

  // Plain league / americano lane.
  if (nextNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
    return null
  }

  let pairings: Pairing[]

  if (tournament.type === TournamentType.AMERICANO || tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
    const allMatches = laneMatches(all, lane)

    if (tournament.type === TournamentType.AMERICANO_WITH_SWAP) {
      pairings = generateAmericanoSwapStandingsPairings(
        competitorIds,
        nextNumber,
        allMatches,
        settings,
        tournament.scoreFormat
      )
    } else if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
      pairings = generateRoundRobinRound(competitorIds, nextNumber)
    } else {
      pairings = generateAmericanoStandingsPairings(competitorIds, allMatches, settings, tournament.scoreFormat)
    }
  } else {
    pairings = generateRoundPairings(tournament.type, settings, competitorIds, nextNumber, [])
  }

  return pairings.length > 0 ? persistRoundMatches(tournamentCategoryId, nextNumber, lane, pairings) : null
}

/**
 * Advances a single round-robin lane independently of every other lane. When its
 * frontier (its highest-numbered round) is fully resolved, the lane's next round
 * is created. Knockout lanes are materialised up front and advance by winner
 * propagation (syncKnockoutNextRound), so there is nothing to build here. Returns
 * true when it changed something (so the driver loop knows to keep going).
 */
async function advanceLane(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  competitorIds: number[],
  cache?: AdvanceCache
): Promise<boolean> {
  // Knockout brackets are fully pre-materialised; their progression is winner
  // propagation, handled elsewhere.
  if (isKnockoutType(lane.type)) {
    return false
  }

  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const roundNumbers = laneRoundNumbers(all, lane)

  if (roundNumbers.length === 0) {
    return false
  }

  const frontierNumber = roundNumbers[roundNumbers.length - 1]
  const frontier = roundMatchesOf(all, lane, frontierNumber)

  // Only advance once the frontier is fully resolved.
  if (frontier.some((match) => match.status === MatchStatus.PENDING)) {
    return false
  }

  const next = await buildLaneNextRound(
    tournament,
    tournamentCategoryId,
    lane,
    frontierNumber + 1,
    competitorIds,
    cache
  )

  if (next && next.length > 0) {
    cache?.invalidate(tournamentCategoryId)

    return true
  }

  return false
}

/**
 * Groups+playoff join: once EVERY group of a category has played all its
 * round-robin rounds with no pending match, builds the knockout bracket seeded
 * from the final group standings. No-op until then, or if the bracket already
 * exists. Returns true when the bracket was created.
 */
async function maybeStartGroupsKnockout(
  tournament: Tournament,
  tournamentCategoryId: number,
  competitorIds: number[],
  cache?: AdvanceCache
): Promise<boolean> {
  if (tournament.type !== TournamentType.GROUPS_PLAYOFF) {
    return false
  }

  const knockoutLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)

  if (laneExistsIn(all, knockoutLane)) {
    return false
  }

  const settings = tournament.settings ?? {}
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache)

  // With a single group there is nothing to cross-seed.
  if (groups.filter((group) => group.length > 0).length <= 1) {
    return false
  }

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length < 2) {
      continue
    }

    const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: index }
    const groupRoundNumbers = laneRoundNumbers(all, lane)

    // The group must have materialised all of its rounds and resolved them all.
    if (groupRoundNumbers.length < roundRobinRoundsFor(group.length)) {
      return false
    }

    if (laneMatches(all, lane).some((match) => match.status === MatchStatus.PENDING)) {
      return false
    }
  }

  const seeded = await computeGroupsKnockoutSeeds(tournamentCategoryId, competitorIds, settings, cache)
  const startNumber = getGroupPhaseRounds(settings, competitorIds.length) + 1
  const created = await createKnockoutBracket(tournamentCategoryId, knockoutLane, seeded, startNumber)

  if (created === 0) {
    return false
  }

  cache?.invalidate(tournamentCategoryId)

  return true
}

/**
 * Playoff-with-consolation join: once every competitor has played (and possibly
 * lost) their first real match, builds the consolation bracket from the
 * first-round losers. Returns true when the bracket was created.
 */
async function maybeStartConsolation(
  tournament: Tournament,
  tournamentCategoryId: number,
  cache?: AdvanceCache
): Promise<boolean> {
  if (tournament.type !== TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return false
  }

  const consolationLane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)

  if (laneExistsIn(all, consolationLane)) {
    return false
  }

  const { ready, losers } = await computeConsolationSeeds(tournamentCategoryId, cache)

  if (!ready || losers.length < 2) {
    return false
  }

  // The consolation entrants are the round-1 losers, so it starts at number 2.
  const created = await createKnockoutBracket(tournamentCategoryId, consolationLane, losers, 2)

  if (created === 0) {
    return false
  }

  cache?.invalidate(tournamentCategoryId)

  return true
}

/**
 * Drives the whole tournament forward after a result is saved/edited. Every lane
 * advances on its own schedule. Group phases reconverge into the knockout only
 * once ALL groups of the category are done. Loops until nothing else can move.
 */
async function advanceTournament(tournament: Tournament, scopeCategoryId?: number): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  const categories = await getTournamentCategories(tournament)
  const scopedCategories =
    scopeCategoryId != null ? categories.filter((category) => category.id === scopeCategoryId) : categories
  const cache = new AdvanceCache()
  let progressed = true

  while (progressed) {
    progressed = false

    for (const category of scopedCategories) {
      const competitorIds = await getSortedCompetitorIds(tournament, category.id, cache)

      if (competitorIds.length < 2) {
        continue
      }

      // 1. Advance every existing round-robin lane independently.
      const lanes = getCategoryLanes(await loadCategoryMatches(category.id, cache))

      for (const lane of lanes) {
        if (await advanceLane(tournament, category.id, lane, competitorIds, cache)) {
          progressed = true
        }
      }

      // 2. Cross-lane joins (groups → knockout, and the consolation bracket).
      if (await maybeStartGroupsKnockout(tournament, category.id, competitorIds, cache)) {
        progressed = true
      }

      if (await maybeStartConsolation(tournament, category.id, cache)) {
        progressed = true
      }
    }
  }

  // NOTE: the tournament is intentionally NOT finished here. Finalisation happens
  // explicitly via finishTournament (organizer button) or the processTournaments
  // cron once isTournamentComplete() is true.
}

/**
 * Deletes a lane from `fromNumber` onward and rebuilds its next round from the
 * corrected data. Used to regenerate a standings-dependent round after a result
 * is edited in its (still-resultless) predecessor.
 */
async function rebuildLaneFrom(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  fromNumber: number
): Promise<void> {
  const all = await loadCategoryMatches(tournamentCategoryId)
  const toDelete = laneMatches(all, lane).filter((match) => match.roundNumber >= fromNumber)

  if (toDelete.length === 0) {
    return
  }

  await deleteMatches(toDelete)

  const competitorIds = await getSortedCompetitorIds(tournament, tournamentCategoryId)

  await buildLaneNextRound(tournament, tournamentCategoryId, lane, fromNumber, competitorIds)
}

/**
 * After a result is edited in an already-closed round (during its grace window),
 * rebuilds the downstream structures derived from it so a competitor that
 * advanced by mistake is corrected. Always safe because a closed round is only
 * editable while its dependent structure has not yet received any result.
 */
async function regenerateDownstreamRounds(tournament: Tournament, editedMatch: Match): Promise<void> {
  const tournamentCategoryId = editedMatch.tournamentCategoryId

  switch (tournament.type) {
    case TournamentType.AMERICANO:

    case TournamentType.AMERICANO_WITH_SWAP: {
      const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: null }

      await rebuildLaneFrom(tournament, tournamentCategoryId, lane, editedMatch.roundNumber + 1)
      break
    }

    case TournamentType.GROUPS_PLAYOFF: {
      // A group-phase edit can change who qualifies → drop the knockout so it is
      // reseeded. Only reachable while the knockout holds no results yet.
      if (editedMatch.type === MatchType.LEAGUE && editedMatch.groupNumber != null) {
        await deleteLane(tournamentCategoryId, { type: MatchType.BRACKET, groupNumber: null })
      }

      break
    }

    case TournamentType.PLAYOFF_WITH_CONSOLATION: {
      // A main-bracket edit can change who drops to the consolation bracket. Only
      // reseed it when it exists and has not started yet (never clobber results).
      if (editedMatch.type === MatchType.BRACKET) {
        const consolationLane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
        const all = await loadCategoryMatches(tournamentCategoryId)

        if (laneExistsIn(all, consolationLane) && !laneHasResultsIn(all, consolationLane)) {
          await deleteLane(tournamentCategoryId, consolationLane)
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
 * winners, rebuilds any structure derived from an edited (already-resolved)
 * result, and advances every lane independently. Editability (the former grace
 * window) is derived from the matches, so there is nothing to expire here.
 *
 * `wasAlreadyResolved` is true when the match already held a result before this
 * write (a genuine correction), so downstream structures that were seeded from
 * it must be regenerated. On a first-time result there is nothing to correct —
 * the next round/bracket is built fresh by advanceTournament — so regenerating
 * (which would delete-and-recreate a still-resultless dependent lane) is skipped.
 */
export async function progressTournamentAfterResult(
  tournament: Tournament,
  match: Match,
  wasAlreadyResolved = false
): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return
  }

  const lane: RoundLane = { type: match.type, groupNumber: match.groupNumber ?? null }

  if (isKnockoutType(match.type)) {
    await syncKnockoutNextRound(match.tournamentCategoryId, lane, match.roundNumber)
  }

  if (wasAlreadyResolved) {
    await regenerateDownstreamRounds(tournament, match)
  }

  // Only the edited match's category can advance from a single result.
  await advanceTournament(tournament, match.tournamentCategoryId)
}

/** Tournament input normalization/validation helpers shared by API routes. */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/i
// ~1.1MB decoded — generous for a client-compressed poster picture while
// keeping tournament rows (and the listing payload, which embeds every
// tournament's image) reasonably sized.
const MAX_IMAGE_DATA_URL_LENGTH = 1_500_000

/**
 * Validates an optional "HH:mm" start time.
 * Returns the normalized value (or null when empty), or `false` when invalid.
 */
export function normalizeStartTime(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()

  if (trimmed === '') {
    return null
  }

  return TIME_PATTERN.test(trimmed) ? trimmed : false
}

/**
 * Validates the optional tournament poster picture, sent by the client as a
 * base64 data URL (already compressed/resized in the browser). Returns the
 * normalized value (or null when absent/cleared), or `false` when invalid.
 */
export function normalizeImage(value: unknown): string | null | false {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string' || !IMAGE_DATA_URL_PATTERN.test(value)) {
    return false
  }

  return value.length <= MAX_IMAGE_DATA_URL_LENGTH ? value : false
}

/**
 * Normalizes the organizer-provided category names: trims, drops blanks and
 * removes duplicates (case-insensitive). Returns null when there are none.
 */
export function normalizeCategories(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const seen = new Set<string>()
  const categories: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const trimmed = entry.trim()
    const key = trimmed.toLowerCase()

    if (trimmed === '' || seen.has(key)) {
      continue
    }

    seen.add(key)
    categories.push(trimmed)
  }

  return categories.length > 0 ? categories : null
}

/**
 * Offset (timeZone − UTC) in milliseconds at the given instant. Uses the Intl
 * API, so any IANA zone name works and DST is taken into account. Throws when the
 * zone name is invalid.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant)
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))

  return asUtc - instant.getTime()
}

/**
 * Converts a wall-clock date/time ("YYYY-MM-DD" + "HH:mm") expressed in
 * `timeZone` into the absolute UTC instant it represents. Falls back to
 * interpreting the wall time as UTC when the zone name is invalid/unknown.
 */
function zonedWallTimeToInstant(dateStr: string, timeStr: string, timeZone: string): Date {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`)

  if (Number.isNaN(naiveUtc.getTime())) {
    return naiveUtc
  }

  try {
    // Two passes so an offset that changes right around the instant (DST edges)
    // still resolves to the correct UTC moment.
    let offset = timeZoneOffsetMs(naiveUtc, timeZone)

    offset = timeZoneOffsetMs(new Date(naiveUtc.getTime() - offset), timeZone)

    return new Date(naiveUtc.getTime() - offset)
  } catch {
    return naiveUtc
  }
}

/**
 * Whether a STAND_BY tournament's scheduled start instant has arrived, evaluated
 * in the organization's `timeZone`.
 *
 * - No startTime set → due at the start of its start day (00:00) in the org's
 *   timezone, so it never starts before the organization's calendar day begins.
 * - startTime ("HH:mm") set → the full local start instant (startDate at startTime
 *   in the org's timezone) must be now or in the past, so a tournament scheduled
 *   for later today is NOT started ahead of its time.
 *
 * `timeZone` is an IANA name (e.g. "America/Argentina/Buenos_Aires"); an
 * unknown/empty value is treated as UTC.
 */
export function isTournamentStartDue(tournament: Tournament, timeZone = 'UTC', now: Date = new Date()): boolean {
  const time = tournament.startTime ?? '00:00'
  const startAt = zonedWallTimeToInstant(tournament.startDate, time, timeZone || 'UTC')

  // Unparseable startDate/startTime → don't block the start (date prefilter decided).
  if (Number.isNaN(startAt.getTime())) {
    return true
  }

  return startAt.getTime() <= now.getTime()
}

/** Maps each organization id to its configured IANA timezone (UTC when unset). */
export async function loadOrganizationTimezones(): Promise<Map<number, string>> {
  const organizations = await Organization.get()

  return new Map(organizations.map((organization) => [organization.id, organization.timezone || 'UTC']))
}
