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
import {
  assignGroups,
  buildGroups,
  computeGroupSizes,
  interclubsGroupSizes,
  resolveSiteId,
  sortCompetitorIds,
  storedGroupMembership
} from '@/app/(protected)/(tournaments)/utils/groups'
import {
  assignLocality,
  InterclubsMode,
  LocalityPair,
  orderKnockoutSides,
  resolveInterclubsFormat
} from '@/app/(protected)/(tournaments)/utils/interclubs'
import { LateRegistrationSlot, LateRegistrationSlotKind } from '@/app/(protected)/(tournaments)/utils/lateRegistration'
import { countsForStandings } from '@/app/(protected)/(tournaments)/utils/matches'
import { supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
import { getGamesWon, getSetsWon } from '@/app/(protected)/(tournaments)/utils/score'
import {
  allowsUnorderedResults,
  hasConsolationBracket,
  matchesPerCompetitor
} from '@/app/(protected)/(tournaments)/utils/settings'
import { rankInterclubs } from '@/app/(protected)/(tournaments)/utils/standings'
import { ApiException } from '@/app/models/ApiException'
import { Organization } from '@/app/models/Organization'
import { User } from '@/app/models/User'

/**
 * Pure functions that compute the pairings of every tournament round.
 * Competitors are referenced by id. A side holds one competitor id.
 *
 * `home`/`away` are null while that side is not yet known (a knockout
 * "to be defined" placeholder); `away` is also null for a permanent bye/void
 * slot — `persistRoundMatches` decides the resulting `status` from context,
 * so the two null cases never need to be told apart by the id alone.
 */

export interface Pairing {
  home: number | null
  away: number | null
  position: number
}

/** Round-robin rounds needed for `size` competitors (circle method). */
function roundRobinRoundsFor(size: number): number {
  if (size < 2) {
    return 0
  }

  return size % 2 === 0 ? size - 1 : size
}

/** Caps `rounds` at `maxRounds` when it is set to a positive number, else returns it unchanged. */
function capRounds(rounds: number, maxRounds: number | null | undefined): number {
  return maxRounds != null && maxRounds > 0 ? Math.min(rounds, maxRounds) : rounds
}

/**
 * The `maxRounds` cap as it applies to the SCHEDULE. Unordered tournaments
 * reinterpret `maxRounds` as a per-competitor match quota (enforced by voiding
 * fixtures, not by generating fewer rounds), so the schedule itself is never
 * cut short: the complete round robin is always laid out.
 */
function scheduleRoundCap(type: TournamentType, settings: TournamentSettings): number | null | undefined {
  return allowsUnorderedResults(type, settings) ? null : settings.maxRounds
}

/** Knockout rounds (to the final) needed for `entrants` competitors. */
export function getKnockoutRounds(entrants: number): number {
  return entrants < 2 ? 0 : Math.ceil(Math.log2(entrants))
}

/** Power-of-two bracket size that fits `entrants` (min 2). */
export function getBracketSize(entrants: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(entrants, 2))))
}

// Group sizing and membership are model-free and shared with the client-side
// views (standings tables), so they live in utils/groups.ts; they stay exported
// from here for the engine's callers and tests.
export { assignGroups, computeGroupSizes }

/**
 * How many competitors each group sends to the knockout phase.
 *
 * The baseline is `qualifiersPerGroup` (clamped to the group size). When
 * `minPlayoffQualifiers` is set it takes precedence, but only upwards: the
 * cut-off level is raised **evenly across every group** until the total reaches
 * the minimum, or until the largest group is exhausted (nobody can be invented).
 *
 * Raising a single level for everyone — rather than handing extra slots to
 * individual groups — is what keeps the knockout fair: with 2 groups of 4 and a
 * minimum of 6, the top 3 of each group advance instead of "the top 2 plus the
 * two best runners-up". Because the level is shared, uneven group sizes may
 * overshoot the minimum, which is fine: it is a floor, not a target.
 *
 * Examples (sizes / qualifiers / minimum → result):
 *   [8]           2  6    → [6]            a lone group sends its top 6
 *   [4, 4]        2  6    → [3, 3]         top 3 of each
 *   [10]          4  9000 → [10]           minimum beyond the field: everybody
 *   [4, 4, 4, 4]  2  4    → [2, 2, 2, 2]   already 8 ≥ 4, nothing changes
 *   [6, 2]        2  7    → [5, 2]         the small group runs out first
 */
export function resolveGroupQualifiers(
  groupSizes: number[],
  qualifiersPerGroup: number,
  minPlayoffQualifiers?: number | null
): number[] {
  const cutAt = (level: number) => groupSizes.map((size) => Math.min(level, size))
  const total = (quotas: number[]) => quotas.reduce((sum, quota) => sum + quota, 0)
  const largest = groupSizes.reduce((max, size) => Math.max(max, size), 0)
  let level = Math.max(1, Math.floor(qualifiersPerGroup) || 1)
  let quotas = cutAt(level)

  if (minPlayoffQualifiers == null || minPlayoffQualifiers <= 0) {
    return quotas
  }

  while (total(quotas) < minPlayoffQualifiers && level < largest) {
    level++
    quotas = cutAt(level)
  }

  return quotas
}

/** A competitor's finishing position in its group, with the points it earned there. */
export interface GroupRankRow {
  competitorId: number
  points: number
}

/** Seeding weight of a competitor, used to break ties on equal group points. */
export interface SeedTieBreaker {
  /** Ranking seed assigned before the tournament started, if any. */
  seedNumber?: number | null
}

/**
 * Cross-seeds the knockout phase of a groups+playoff tournament. `qualifiers`
 * is ordered per group (index 0 is the group winner). Returns a flat seeded
 * lineup where every rank **tier** is grouped together (all group winners first,
 * then all runners-up, ...). Fed to the standard bracket seeding this makes
 * group winners earn the byes and keeps competitors from different tiers apart.
 *
 * The tier is the primary key on purpose: raw points are not comparable across
 * groups, because `computeGroupSizes` allows uneven sizes (11 competitors in
 * groups of 4 → [4, 4, 3]) and a bigger group simply plays more matches. Winning
 * a group of 3 undefeated must not rank below finishing second in a group of 4.
 *
 * Within a tier, though, points DO decide: the best runner-up is seeded above
 * the worst one. Ties fall back to the pre-tournament ranking seed and finally
 * to the competitor id, so the result is fully deterministic — this function is
 * recomputed from scratch on every advance and two calls must always agree.
 *
 * With a single group the tiers hold one competitor each, so the result is
 * simply that group's standings, which is exactly what a one-group knockout
 * wants.
 */
export function seedFromGroups(qualifiers: GroupRankRow[][], tieBreakers?: Map<number, SeedTieBreaker>): number[] {
  const maxRank = qualifiers.reduce((max, group) => Math.max(max, group.length), 0)
  const seeded: number[] = []

  const byStrength = (a: GroupRankRow, b: GroupRankRow): number => {
    if (b.points !== a.points) {
      return b.points - a.points
    }

    const seedA = tieBreakers?.get(a.competitorId)?.seedNumber ?? Infinity
    const seedB = tieBreakers?.get(b.competitorId)?.seedNumber ?? Infinity

    if (seedA !== seedB) {
      return seedA - seedB
    }

    return a.competitorId - b.competitorId
  }

  for (let rank = 0; rank < maxRank; rank++) {
    const tier = qualifiers.map((group) => group[rank]).filter((row): row is GroupRankRow => row !== undefined)

    seeded.push(...[...tier].sort(byStrength).map((row) => row.competitorId))
  }

  return seeded
}

/**
 * Rearranges first-round pairings so two competitors sharing a "clash key" —
 * group membership, home site, ... — do not meet again straight away. Several
 * keying functions can be given at once (e.g. group AND site) so a single swap
 * pass satisfies every dimension together instead of one repair undoing another.
 *
 * Typical case this fixes: ordering each tier by points (see `seedFromGroups`)
 * means the tier no longer aligns with the group index, so the bracket can pit
 * a group's runner-up against its own third place. The same clash already
 * happens without any reordering whenever the qualifier count does not fit the
 * bracket neatly — 3 groups sending 2 each fills a bracket of 8 and pairs C1
 * against C2.
 *
 * The fix is a swap pass over the pairings, deliberately conservative:
 *   - only the "away" slots move, so byes and the top seeds' path never change;
 *   - the swap partner is the one closest in seed order, to perturb the bracket
 *     as little as possible;
 *   - a swap is applied only when it does not create a new clash on any key;
 *   - positions are visited in order and the first valid partner wins, so the
 *     outcome is deterministic — no randomness anywhere.
 *
 * It is best-effort: some line-ups have no valid swap (in the extreme, a single
 * group, where every pairing is an intra-group one and nothing can be done).
 * Those are left untouched rather than shuffled pointlessly.
 */
export function repairClashingPairings(
  pairings: Pairing[],
  keyOfs: Array<(competitorId: number) => unknown>
): Pairing[] {
  if (keyOfs.length === 0) {
    return pairings
  }

  const clashes = (pairing: Pairing): boolean => {
    if (pairing.home == null || pairing.away == null) {
      return false
    }

    return keyOfs.some((keyOf) => {
      const home = keyOf(pairing.home!)
      const away = keyOf(pairing.away!)

      return home !== undefined && home !== null && home === away
    })
  }

  // Only pairings with two real sides can be swapped; byes have nothing to move.
  const swappable = pairings.filter((pairing) => pairing.away != null && pairing.home != null)

  for (const pairing of swappable) {
    if (!clashes(pairing)) {
      continue
    }

    // Closest position first: adjacent bracket slots hold competitors of
    // comparable strength, so swapping there barely moves the seeding.
    const candidates = swappable
      .filter((other) => other !== pairing)
      .sort((a, b) => Math.abs(a.position - pairing.position) - Math.abs(b.position - pairing.position))

    for (const candidate of candidates) {
      const mine = pairing.away!
      const theirs = candidate.away!

      pairing.away = theirs
      candidate.away = mine

      if (!clashes(pairing) && !clashes(candidate)) {
        break
      }

      pairing.away = mine
      candidate.away = theirs
    }
  }

  return pairings
}

/** `repairClashingPairings` for a single group-membership map — see it for the algorithm. */
export function repairSameGroupPairings(pairings: Pairing[], groupOf: Map<number, number>): Pairing[] {
  return repairClashingPairings(pairings, [(id) => groupOf.get(id)])
}

/** `repairClashingPairings` for a single competitor-site map — see it for the algorithm. */
export function repairSameSitePairings(pairings: Pairing[], siteOf: Map<number, number>): Pairing[] {
  return repairClashingPairings(pairings, [(id) => siteOf.get(id)])
}

/** Total number of rounds for a tournament given its competitors count. */
export function getTotalRounds(type: TournamentType, settings: TournamentSettings, competitorsCount: number): number {
  if (competitorsCount < 2) {
    return 0
  }

  switch (type) {
    case TournamentType.LEAGUE:
      return capRounds(roundRobinRoundsFor(competitorsCount), scheduleRoundCap(type, settings))

    case TournamentType.INTERCLUBS: {
      const format = resolveInterclubsFormat(competitorsCount)

      // Few teams: a single zone played home and away — twice the round robin.
      if (format.mode === InterclubsMode.DOUBLE_LEAGUE) {
        return roundRobinRoundsFor(competitorsCount) * 2
      }

      const groupRounds = format.groupSizes.reduce((max, size) => Math.max(max, roundRobinRoundsFor(size)), 0)

      return groupRounds + getKnockoutRounds(format.totalQualifiers)
    }

    case TournamentType.AMERICANO:
      return capRounds(roundRobinRoundsFor(competitorsCount), settings.maxRounds)

    case TournamentType.PLAYOFF:
      // When settings.consolationBracket is on, it runs in parallel with the
      // main one and finishes on the same round, so it does not add rounds.
      return getKnockoutRounds(competitorsCount)

    case TournamentType.GROUPS_PLAYOFF: {
      const groupSize = settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
      const qualifiers = settings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
      const sizes = computeGroupSizes(competitorsCount, groupSize)
      const groupRounds = getGroupPhaseRounds(settings, competitorsCount, type)
      const totalQualifiers = resolveGroupQualifiers(sizes, qualifiers, settings.minPlayoffQualifiers).reduce(
        (sum, quota) => sum + quota,
        0
      )

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

/**
 * Group-phase rounds of a category that plays groups before a knockout
 * (groups+playoff, or an interclubes tournament that outgrew the single-zone
 * league), taken from its largest group. For groups+playoff this is further
 * capped by the optional `maxRounds` setting, closing the groups early and
 * kicking off the knockout sooner.
 */
export function getGroupPhaseRounds(
  settings: TournamentSettings,
  competitorsCount: number,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): number {
  const sizes =
    type === TournamentType.INTERCLUBS
      ? interclubsGroupSizes(competitorsCount)
      : computeGroupSizes(
          competitorsCount,
          settings.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
        )

  return getGroupPhaseRoundsFromSizes(settings, sizes, type)
}

/**
 * `getGroupPhaseRounds` from the group sizes that are actually in play, rather
 * than from a competitor count the sizes are re-derived from.
 *
 * The engine uses this variant wherever it already holds the groups, because
 * once a category's membership is frozen (see `freezeGroupMembership`) the
 * competitor count no longer determines the sizes: a late entrant joining an
 * odd group grows that ONE group instead of triggering a fresh
 * `computeGroupSizes` split. Re-deriving there would change the group phase's
 * length mid-tournament.
 *
 * A late entrant never changes the answer either way: they only ever fill the
 * circle method's bye slot of an odd group, and an odd group of size k needs
 * exactly as many rounds as the even group of size k+1 it becomes.
 */
export function getGroupPhaseRoundsFromSizes(
  settings: TournamentSettings,
  groupSizes: number[],
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): number {
  const naturalRounds = groupSizes.reduce((max, size) => Math.max(max, roundRobinRoundsFor(size)), 0)

  // The round cap only applies to groups+playoff — interclubes zones do not
  // support this setting.
  return type === TournamentType.GROUPS_PLAYOFF
    ? capRounds(naturalRounds, scheduleRoundCap(type, settings))
    : naturalRounds
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

    pairings.push({ home, away, position: position++ })
  }

  return pairings
}

/**
 * One round of an interclubes round-robin (a zone, or the single home-and-away
 * league of a small tournament).
 *
 * The circle method decides WHO plays whom; who plays at HOME is then decided
 * separately by the interclubes rotation rule (`assignLocality`), because in
 * this format home advantage is real and must alternate fairly — the side a
 * competitor happens to land on in the circle carries no meaning.
 *
 * For the home-and-away variant, rounds beyond the first full round robin
 * replay it from the start (`roundNumber` wrapped around `R`); the rematch gets
 * the inverted localía for free, since the two teams have met before.
 */
function generateInterclubsRoundRobinRound(
  competitorIds: number[],
  roundNumber: number,
  previousMatches: Match[],
  doubleRound: boolean
): Pairing[] {
  const totalRounds = roundRobinRoundsFor(competitorIds.length)

  if (totalRounds === 0 || roundNumber > (doubleRound ? totalRounds * 2 : totalRounds)) {
    return []
  }

  const baseRound = ((roundNumber - 1) % totalRounds) + 1
  const pairs = roundRobinPairs(competitorIds, baseRound)
  const pending: LocalityPair[] = []
  let position = 0

  for (const [first, second] of pairs) {
    if (first == null || second == null) {
      continue
    }

    pending.push({ first, second, position: position++ })
  }

  return assignLocality(pending, previousMatches, roundNumber).map((sides) => ({
    home: sides.home,
    away: sides.away,
    position: sides.position
  }))
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
      home: home ?? away,
      away: home == null ? null : away,
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
      return match.homeCompetitorId
    }

    if (match.winner === MatchSide.AWAY) {
      return match.awayCompetitorId
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
      home: home ?? away,
      away: home == null || away == null ? null : away,
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

    case TournamentType.PLAYOFF:
      return generatePlayoffRound(competitorIds, roundNumber, previousRoundMatches)

    case TournamentType.GROUPS_PLAYOFF:
      // Groups+playoff rounds are generated bracket-by-bracket by the helpers.
      return []

    case TournamentType.INTERCLUBS:
      // Interclubes needs every match played so far to assign the localía, which
      // this signature does not carry: its rounds are built by
      // `generateInterclubsRoundRobinRound` from the materialisation helpers.
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
  private sitesByCategory = new Map<number, Map<number, number>>()

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

  /** Competitor id → site id of a category (cached for the whole run, same lifetime as `competitors`). */
  async sites(tournamentCategoryId: number): Promise<Map<number, number>> {
    let siteOf = this.sitesByCategory.get(tournamentCategoryId)

    if (!siteOf) {
      siteOf = await buildCompetitorSiteMap(await this.competitors(tournamentCategoryId))
      this.sitesByCategory.set(tournamentCategoryId, siteOf)
    }

    return siteOf
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

/**
 * Site (sede) each competitor represents, per the shared precedence rule (see
 * `resolveSiteId` in utils/groups.ts): `data.siteId` when set (interclubes
 * teams), else the players' shared home site, else unassigned — and simply
 * absent from the map, since every repair pass treats "no key" as "never
 * clashes". Batches a single query for every player's `siteId` regardless of
 * how many competitors are involved.
 */
async function buildCompetitorSiteMap(competitors: Competitor[]): Promise<Map<number, number>> {
  const playerIds = [...new Set(competitors.flatMap((competitor) => competitor.playerIds ?? []))]
  const players = playerIds.length > 0 ? await User.whereIn('id', playerIds).get() : []
  const siteIdByPlayer = new Map(players.map((player) => [player.id, player.siteId]))
  const siteOf = new Map<number, number>()

  for (const competitor of competitors) {
    const siteId = resolveSiteId(
      competitor.data?.siteId,
      (competitor.playerIds ?? []).map((id) => siteIdByPlayer.get(id))
    )

    if (siteId != null) {
      siteOf.set(competitor.id, siteId)
    }
  }

  return siteOf
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
    (match) => isLaneMatch(match, lane) && match.awayCompetitorId != null && match.status !== MatchStatus.PENDING
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
 * Minimal shape `canDeleteTournament` needs — satisfied by both the `Tournament`
 * entity and the client-facing `TournamentDto`, so the same check can run on the
 * server (before deleting) and on the client (to grey out the delete button).
 */
interface DeletableTournament {
  status: TournamentStatus
  entryFee: number | null
  paid: boolean
}

/**
 * A tournament can always be deleted while it is still STAND_BY (nothing has
 * been played yet). Once it starts (ONGOING) or ends (FINISHED), a tournament
 * that charges an entry fee — and therefore owes TeamUp's service fee — can no
 * longer be deleted until that fee is settled (`paid`). Free tournaments
 * (`entryFee` null/0) are never billed, so they stay deletable regardless of
 * status.
 */
export function canDeleteTournament(tournament: DeletableTournament): boolean {
  if (tournament.status === TournamentStatus.STAND_BY) {
    return true
  }

  const isBillable = tournament.entryFee != null && tournament.entryFee > 0

  return !isBillable || tournament.paid
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
 * Drops the fixtures that an unordered round robin voided along the way (see
 * `syncUnorderedVoids`), called once the tournament is over.
 *
 * They are kept for the whole run because a corrected result can bring them
 * back (and because they hold the venue/day/time the planner assigned them),
 * but a finished tournament will never revisit any of that: nobody can edit a
 * result once the tournament stops being ONGOING, and there is no path back
 * from FINISHED to ONGOING. Should one ever be added, it would have to
 * regenerate the round robin — the deleted fixtures are gone for good.
 *
 * Purely a clean-up: voided fixtures are already excluded from points,
 * standings and statistics (see `countsForStandings`), so removing them changes
 * no number anywhere. Returns how many were deleted.
 */
export async function deleteVoidedFixtures(tournament: Tournament): Promise<number> {
  if (!allowsUnorderedResults(tournament.type, tournament.settings)) {
    return 0
  }

  const categoryIds = await getTournamentCategoryIds(tournament)

  if (categoryIds.length === 0) {
    return 0
  }

  const all = await Match.whereIn('tournamentCategoryId', categoryIds).get()
  // Round-robin lanes only. Knockout lanes use VOID for their own purpose (an
  // empty consolation slot), and those matches are part of the bracket's shape.
  const voided = all.filter((match) => match.status === MatchStatus.VOID && match.type === MatchType.LEAGUE)

  await deleteMatches(voided)

  return voided.length
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

  return sortCompetitorIds(competitors, tournament.type)
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
  cache?: AdvanceCache,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): Promise<number[][]> {
  const allCategoryCompetitors = cache
    ? await cache.competitors(tournamentCategoryId)
    : await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()
  // A started category carries its membership on the competitors themselves, so
  // it survives a late entrant joining (see `freezeGroupMembership`). Checked
  // first for exactly that reason: re-deriving would reshuffle groups that are
  // already being played.
  const stored = storedGroupMembership(allCategoryCompetitors)

  if (stored) {
    return stored
  }

  const seededCount = allCategoryCompetitors.filter((competitor) => competitor.seedNumber != null).length
  const siteOf = cache ? await cache.sites(tournamentCategoryId) : await buildCompetitorSiteMap(allCategoryCompetitors)

  // Same pure split the views use (see utils/groups.ts), so what is played and
  // what is displayed can never diverge. `siteOf` makes the split try to avoid
  // grouping competitors from the same site together — best effort, see
  // `repairSameSiteGroups`.
  return buildGroups(competitorIds, seededCount, settings, type, siteOf)
}

/**
 * Writes each competitor's group membership onto the competitor itself, once,
 * as the tournament starts. From then on `computeCategoryGroups` (engine) and
 * `computeGroupMembership` (views) read it back instead of re-deriving it, so
 * the groups that get played can never be reshuffled by a later change to the
 * competitor list — which is precisely what makes registering a late entrant
 * into a running group phase safe.
 *
 * Only groups+playoff freezes: it is the one type that both plays groups and
 * accepts late entrants. Interclubes derives its whole format from how many
 * teams registered, so it stays on the derivation and is never open to late
 * registration.
 *
 * Idempotent, and a no-op for a category whose membership is already frozen.
 */
export async function freezeGroupMembership(tournament: Tournament): Promise<void> {
  if (tournament.type !== TournamentType.GROUPS_PLAYOFF) {
    return
  }

  for (const category of await getTournamentCategories(tournament)) {
    const competitors = await Competitor.where('tournamentCategoryId', category.id).orderBy('id').get()

    if (competitors.length === 0 || storedGroupMembership(competitors)) {
      continue
    }

    const competitorIds = sortCompetitorIds(competitors, tournament.type)
    const groups = await computeCategoryGroups(category.id, competitorIds, tournament.settings ?? {})
    const byId = new Map(competitors.map((competitor) => [competitor.id, competitor]))

    for (let groupNumber = 0; groupNumber < groups.length; groupNumber++) {
      const group = groups[groupNumber]

      for (let groupPosition = 0; groupPosition < group.length; groupPosition++) {
        const competitor = byId.get(group[groupPosition])

        if (!competitor) {
          continue
        }

        competitor.data = { ...(competitor.data ?? {}), groupNumber, groupPosition }
        await competitor.save()
      }
    }
  }
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
    const isBye = pairing.away === null && pairing.home != null

    return {
      tournamentCategoryId,
      roundNumber,
      type: lane.type,
      groupNumber: lane.groupNumber,
      position: pairing.position,
      bracketInstance,
      homeCompetitorId: pairing.home,
      awayCompetitorId: pairing.away,
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

/** Competitor id of the winning side of a resolved match (null when unresolved). */
function matchWinnerId(match: Match): number | null {
  if (match.winner === MatchSide.HOME) {
    return match.homeCompetitorId
  }

  if (match.winner === MatchSide.AWAY) {
    return match.awayCompetitorId
  }

  return null
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
  cache?: AdvanceCache,
  applyLocality = false
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
    let homeId = homeFeeder ? matchWinnerId(homeFeeder) : null
    let awayId = awayFeeder ? matchWinnerId(awayFeeder) : null

    // Interclubes: the bracket decides WHO meets, the localía rule decides who
    // hosts. The match being filled is excluded from the history it is compared
    // against — otherwise its own (previous) assignment would read as an earlier
    // encounter and the sides would flip on every pass.
    if (applyLocality && homeId != null && awayId != null) {
      const [home, away] = orderKnockoutSides(
        homeId,
        awayId,
        all.filter((match) => match.id !== target.id),
        `${target.roundNumber}:${target.position}`
      )

      homeId = home
      awayId = away
    }

    if (target.homeCompetitorId === homeId && target.awayCompetitorId === awayId) {
      continue
    }

    target.homeCompetitorId = homeId
    target.awayCompetitorId = awayId
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
 *
 * When the entrants come out of a groups phase, `groupOf` lets the first round be
 * repaired so nobody faces a rival from their own group straight away. The first
 * round is additionally, always, given the same best-effort treatment against
 * competitors that share a site (see `resolveSiteId`/`buildCompetitorSiteMap`) —
 * this covers both a plain knockout's round 1 and a post-groups bracket, and is
 * resolved together with `groupOf` in one swap pass so the two repairs cannot
 * undo each other.
 * Returns 1 when a bracket was created, 0 when there were not enough competitors.
 */
async function createKnockoutBracket(
  tournamentCategoryId: number,
  lane: RoundLane,
  seededIds: number[],
  startRound: number,
  applyLocality = false,
  groupOf?: Map<number, number>,
  cache?: AdvanceCache
): Promise<number> {
  if (seededIds.length < 2) {
    return 0
  }

  const bracketSize = getBracketSize(seededIds.length)
  const totalRounds = getKnockoutRounds(seededIds.length)
  const siteOf = cache
    ? await cache.sites(tournamentCategoryId)
    : await buildCompetitorSiteMap(await Competitor.where('tournamentCategoryId', tournamentCategoryId).get())
  const clashKeyOfs: Array<(id: number) => unknown> = []

  if (groupOf) {
    clashKeyOfs.push((id) => groupOf.get(id))
  }

  if (siteOf.size > 0) {
    clashKeyOfs.push((id) => siteOf.get(id))
  }

  const firstRoundPairings = repairClashingPairings(seedPlayoffPairings(seededIds), clashKeyOfs)

  // Interclubes: seeding says who meets whom, the localía rule says who hosts.
  if (applyLocality) {
    const played = await loadCategoryMatches(tournamentCategoryId)

    for (const pairing of firstRoundPairings) {
      if (pairing.away == null || pairing.home == null) {
        continue
      }

      const [home, away] = orderKnockoutSides(pairing.home, pairing.away, played, `${startRound}:${pairing.position}`)

      pairing.home = home
      pairing.away = away
    }
  }

  // The first knockout round is the furthest from the final: instance = totalRounds
  // (e.g. 3 for an 8-player bracket: Cuartos). Each later round is one closer, so the
  // final (last round) is instance 1.
  await persistRoundMatches(tournamentCategoryId, startRound, lane, firstRoundPairings, totalRounds)

  for (let roundIndex = 2; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = bracketSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: null, away: null, position })
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
    await syncKnockoutNextRound(tournamentCategoryId, lane, roundNumber, undefined, applyLocality)
  }

  return 1
}

/**
 * Resolution of a single consolation-bracket feeder slot. Every slot
 * corresponds one-to-one to a position of the main bracket's round 1 (0-indexed,
 * `0..mainBracketSize/2 - 1`):
 *  - `pending`  — the outcome isn't known yet.
 *  - `filled`   — this bracket slot's occupant has lost their first real match:
 *                 `competitorId` drops into the consolation bracket.
 *  - `void`     — the occupant WON their first real match, so this consolation
 *                 slot is confirmed to never receive an entrant.
 */
type SlotResolution = { state: 'pending' } | { state: 'filled'; competitorId: number } | { state: 'void' }

/**
 * Resolves feeder slot `slotPosition` of the consolation bracket from the
 * current state of the main BRACKET lane. A real round-1 match (both sides
 * present) always produces a loser once played, so it resolves directly. A
 * round-1 bye advances its occupant without playing, so their first real match
 * is round 2 at position `floor(slotPosition / 2)` — home side if `slotPosition`
 * is even, away side if odd (the same parity `syncKnockoutNextRound` uses to
 * feed that match). If the occupant wins that match, the slot is `void`; if
 * they lose it, `filled` with them.
 */
function resolveFirstLossSlot(mainMatches: Match[], slotPosition: number): SlotResolution {
  const round1 = mainMatches.find((match) => match.roundNumber === 1 && match.position === slotPosition)

  if (!round1) {
    return { state: 'pending' }
  }

  // Real round-1 match: always produces a loser once resolved.
  if (round1.awayCompetitorId != null) {
    if (round1.status === MatchStatus.PENDING) {
      return { state: 'pending' }
    }

    const loserId = round1.winner === MatchSide.HOME ? round1.awayCompetitorId : round1.homeCompetitorId

    return { state: 'filled', competitorId: loserId! }
  }

  // Bye: the occupant's real first match is round 2, at the position/side that
  // mirrors syncKnockoutNextRound's 2p (home) / 2p+1 (away) feeder convention.
  const occupantId = round1.homeCompetitorId!
  const parentPosition = Math.floor(slotPosition / 2)
  const round2 = mainMatches.find((match) => match.roundNumber === 2 && match.position === parentPosition)

  if (!round2 || round2.status === MatchStatus.PENDING || round2.awayCompetitorId == null) {
    return { state: 'pending' }
  }

  const isHomeSide = slotPosition % 2 === 0
  const occupantWon =
    (isHomeSide && round2.winner === MatchSide.HOME) || (!isHomeSide && round2.winner === MatchSide.AWAY)

  return occupantWon ? { state: 'void' } : { state: 'filled', competitorId: occupantId }
}

/**
 * Builds the consolation bracket's full skeleton right away — every round,
 * every match, as empty "to be defined" placeholders — instead of waiting for
 * every main-bracket loser to be known. Consolation round-1 match `p` is fed by
 * main round-1 positions `2p` (home) and `2p+1` (away): the two competitors
 * who, in the main bracket, would have had their winners meet in round 2, so
 * their round-1 losers meet each other here instead. Slots resolve
 * progressively via `advanceConsolationBracket` as the corresponding
 * main-bracket matches play out. Returns 1 when a skeleton was created, 0 when
 * there is no room for one (fewer than 2 potential entrants).
 */
async function createConsolationSkeleton(tournamentCategoryId: number, mainBracketSize: number): Promise<number> {
  const consolationSize = mainBracketSize / 2

  if (consolationSize < 2) {
    return 0
  }

  const lane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
  const totalRounds = getKnockoutRounds(consolationSize)
  // Keeps pace with the main bracket: it starts one round later and both lanes
  // finish on the same round number (see getTotalRounds).
  const startRound = 2

  for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex++) {
    const matchCount = consolationSize / Math.pow(2, roundIndex)
    const placeholders: Pairing[] = []

    for (let position = 0; position < matchCount; position++) {
      placeholders.push({ home: null, away: null, position })
    }

    await persistRoundMatches(
      tournamentCategoryId,
      startRound + roundIndex - 1,
      lane,
      placeholders,
      totalRounds - roundIndex + 1
    )
  }

  return 1
}

/** Desired shape to write into a not-yet-finalised consolation match, or null when nothing is actionable yet. */
interface ConsolationSlotUpdate {
  home: number | null
  away: number | null
  status: MatchStatus
  winner: MatchSide | null
}

/**
 * Combines the resolutions of a consolation match's two feeder slots into the
 * shape that match should have. Returns null while there is nothing new to
 * write (both sides already reflect the current resolutions, or neither side
 * can be determined yet).
 */
function combineConsolationSlot(home: SlotResolution, away: SlotResolution): ConsolationSlotUpdate | null {
  if (home.state === 'filled' && away.state === 'filled') {
    return { home: home.competitorId, away: away.competitorId, status: MatchStatus.PENDING, winner: null }
  }

  if (home.state === 'void' && away.state === 'void') {
    return { home: null, away: null, status: MatchStatus.VOID, winner: null }
  }

  if (home.state === 'filled' && away.state === 'void') {
    return { home: home.competitorId, away: null, status: MatchStatus.WALKOVER, winner: MatchSide.HOME }
  }

  if (home.state === 'void' && away.state === 'filled') {
    // Mirrors the bye convention: a lone survivor is always stored as "home".
    return { home: away.competitorId, away: null, status: MatchStatus.WALKOVER, winner: MatchSide.HOME }
  }

  if (home.state === 'filled' && away.state === 'pending') {
    return { home: home.competitorId, away: null, status: MatchStatus.PENDING, winner: null }
  }

  if (home.state === 'pending' && away.state === 'filled') {
    return { home: null, away: away.competitorId, status: MatchStatus.PENDING, winner: null }
  }

  // (void, pending) / (pending, void) / (pending, pending): nothing actionable yet.
  return null
}

/**
 * Fills the consolation bracket's round-1 slots from the main bracket's
 * current state (see `resolveFirstLossSlot` / `combineConsolationSlot`), then
 * propagates the results forward through the rest of the consolation bracket
 * (see `syncConsolationNextRound`). Returns true when it changed something.
 */
async function advanceConsolationBracket(tournamentCategoryId: number, cache?: AdvanceCache): Promise<boolean> {
  const consolationLane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)

  if (!laneExistsIn(all, consolationLane)) {
    return false
  }

  const mainMatches = laneMatches(all, { type: MatchType.BRACKET, groupNumber: null })
  const roundNumbers = laneRoundNumbers(all, consolationLane)
  const firstRoundNumber = roundNumbers[0]
  const round1 = roundMatchesOf(all, consolationLane, firstRoundNumber)
  let changed = false

  for (const match of round1) {
    // Already finalised (walkover/void) or fully known (both sides real,
    // now an ordinary playable match) — never touched again from here.
    const bothKnown = match.homeCompetitorId != null && match.awayCompetitorId != null

    if (match.status !== MatchStatus.PENDING || bothKnown) {
      continue
    }

    const homeResolution = resolveFirstLossSlot(mainMatches, match.position * 2)
    const awayResolution = resolveFirstLossSlot(mainMatches, match.position * 2 + 1)
    const update = combineConsolationSlot(homeResolution, awayResolution)

    if (!update) {
      continue
    }

    if (match.homeCompetitorId === update.home && match.awayCompetitorId === update.away) {
      continue
    }

    match.homeCompetitorId = update.home
    match.awayCompetitorId = update.away
    match.status = update.status
    match.winner = update.winner
    match.updatedAt = new Date()
    await match.save()
    changed = true
  }

  if (changed) {
    cache?.invalidate(tournamentCategoryId)
  }

  for (const roundNumber of roundNumbers.slice(0, -1)) {
    if (await syncConsolationNextRound(tournamentCategoryId, roundNumber, cache)) {
      changed = true
    }
  }

  return changed
}

/**
 * Consolation-only counterpart of `syncKnockoutNextRound`. A feeder can be
 * still pending, a resolved winner, or permanently VOID (see MatchStatus.VOID)
 * — a state the main bracket never produces, so it needs its own propagation:
 * a next-round match with one VOID feeder and one resolved feeder becomes a
 * walkover for the resolved side; with both feeders VOID it becomes VOID
 * itself, cascading the same way through the rest of the bracket. Returns true
 * when it changed anything.
 */
async function syncConsolationNextRound(
  tournamentCategoryId: number,
  roundNumber: number,
  cache?: AdvanceCache
): Promise<boolean> {
  const lane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const current = roundMatchesOf(all, lane, roundNumber)

  if (current.length <= 1) {
    return false
  }

  const next = roundMatchesOf(all, lane, roundNumber + 1)

  if (next.length === 0) {
    return false
  }

  const currentByPosition = new Map(current.map((match) => [match.position, match]))

  const feederState = (
    match: Match | undefined
  ): { state: 'pending' } | { state: 'id'; id: number } | { state: 'void' } => {
    if (!match) {
      return { state: 'pending' }
    }

    if (match.status === MatchStatus.VOID) {
      return { state: 'void' }
    }

    if (match.status === MatchStatus.PENDING) {
      return { state: 'pending' }
    }

    const id = matchWinnerId(match)

    return id != null ? { state: 'id', id } : { state: 'pending' }
  }

  let changed = false

  for (const target of next) {
    if (target.status !== MatchStatus.PENDING) {
      continue
    }

    const home = feederState(currentByPosition.get(target.position * 2))
    const away = feederState(currentByPosition.get(target.position * 2 + 1))
    let update: ConsolationSlotUpdate | null = null

    if (home.state === 'id' && away.state === 'id') {
      update = { home: home.id, away: away.id, status: MatchStatus.PENDING, winner: null }
    } else if (home.state === 'void' && away.state === 'void') {
      update = { home: null, away: null, status: MatchStatus.VOID, winner: null }
    } else if (home.state === 'id' && away.state === 'void') {
      update = { home: home.id, away: null, status: MatchStatus.WALKOVER, winner: MatchSide.HOME }
    } else if (home.state === 'void' && away.state === 'id') {
      update = { home: away.id, away: null, status: MatchStatus.WALKOVER, winner: MatchSide.HOME }
    } else if (home.state === 'id' && away.state === 'pending') {
      update = { home: home.id, away: null, status: MatchStatus.PENDING, winner: null }
    } else if (home.state === 'pending' && away.state === 'id') {
      update = { home: null, away: away.id, status: MatchStatus.PENDING, winner: null }
    }

    if (!update) {
      continue
    }

    if (target.homeCompetitorId === update.home && target.awayCompetitorId === update.away) {
      continue
    }

    target.homeCompetitorId = update.home
    target.awayCompetitorId = update.away
    target.status = update.status
    target.winner = update.winner
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
 * Ranks the competitors of a round-robin group from its resolved matches.
 * Returns them best-first along with the points each one earned, which the
 * knockout seeding needs to order competitors that finished on the same rank in
 * different groups.
 */
function rankGroup(
  competitorIds: number[],
  matches: Match[],
  settings?: Tournament['settings'],
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): GroupRankRow[] {
  // Interclubes zones rank by encounters won → individual matches → sets, with
  // the very same function that feeds the standings table the players see.
  if (type === TournamentType.INTERCLUBS) {
    return rankInterclubs(competitorIds, matches).map((row) => ({
      competitorId: row.competitorId,
      points: row.points
    }))
  }

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
    id: number | null,
    updater: (row: {
      points: number
      won: number
      setsWon: number
      setsLost: number
      gamesWon: number
      gamesLost: number
    }) => void
  ) => {
    const row = id != null ? stats.get(id) : undefined

    if (row) {
      updater(row)
    }
  }

  for (const match of matches) {
    if (!countsForStandings(match)) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)

    add(match.homeCompetitorId, (row) => {
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
    add(match.awayCompetitorId, (row) => {
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
      if (!countsForStandings(match)) {
        continue
      }

      const homeHasA = match.homeCompetitorId === idA
      const homeHasB = match.homeCompetitorId === idB
      const awayHasA = match.awayCompetitorId === idA
      const awayHasB = match.awayCompetitorId === idB

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

  return [...competitorIds]
    .sort((a, b) => {
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
    .map((competitorId) => ({ competitorId, points: stats.get(competitorId)!.points }))
}

/** Knockout lineup of a groups phase: who plays, and which group each one came from. */
interface GroupsKnockoutSeeds {
  /** Competitor ids best-seeded first. */
  seeded: number[]
  /** Group index every qualifier came from, so the bracket can keep them apart. */
  groupOf: Map<number, number>
}

/**
 * Computes the cross-seeded knockout lineup from the final group standings of a
 * groups+playoff category.
 *
 * How many competitors each group sends is `resolveGroupQualifiers`: normally
 * `qualifiersPerGroup`, raised evenly across the groups when
 * `minPlayoffQualifiers` demands a bigger knockout. Interclubes zones keep their
 * own fixed format.
 */
async function computeGroupsKnockoutSeeds(
  tournamentCategoryId: number,
  competitorIds: number[],
  settings: Tournament['settings'],
  cache?: AdvanceCache,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): Promise<GroupsKnockoutSeeds> {
  const safeSettings = settings ?? {}
  // Reconstruct the very same groups that were played (snake-seeded when there
  // are seeds) so the ranking is computed over the right competitors.
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache, type)
  const quotas =
    type === TournamentType.INTERCLUBS
      ? groups.map((group) => Math.min(resolveInterclubsFormat(competitorIds.length).qualifiersPerGroup, group.length))
      : resolveGroupQualifiers(
          groups.map((group) => group.length),
          safeSettings.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup,
          safeSettings.minPlayoffQualifiers
        )
  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const competitors = cache
    ? await cache.competitors(tournamentCategoryId)
    : await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()
  // Pre-tournament ranking seeds break ties between competitors that finished
  // their groups on the same rank with the same points.
  const tieBreakers = new Map(competitors.map((competitor) => [competitor.id, { seedNumber: competitor.seedNumber }]))
  const qualifiers: GroupRankRow[][] = []
  const groupOf = new Map<number, number>()

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length === 0) {
      continue
    }

    const groupMatches = all.filter((match) => match.type === MatchType.LEAGUE && (match.groupNumber ?? null) === index)
    const ranked = rankGroup(group, groupMatches, settings, type)
    const advancing = ranked.slice(0, Math.min(quotas[index] ?? 0, group.length))

    for (const row of advancing) {
      groupOf.set(row.competitorId, index)
    }

    qualifiers.push(advancing)
  }

  return { seeded: seedFromGroups(qualifiers, tieBreakers), groupOf }
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
    if (!countsForStandings(match)) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const games = isWalkover ? { home: 0, away: 0 } : getGamesWon(score, scoreFormat)
    const homeId = match.homeCompetitorId
    const awayId = match.awayCompetitorId

    if (homeId != null) {
      pts.set(homeId, (pts.get(homeId) ?? 0) + games.home * americano.pointsPerGameWon)

      if (match.winner === MatchSide.HOME) {
        pts.set(homeId, (pts.get(homeId) ?? 0) + americano.pointsPerMatchWon)
      }
    }

    if (awayId != null) {
      pts.set(awayId, (pts.get(awayId) ?? 0) + games.away * americano.pointsPerGameWon)

      if (match.winner === MatchSide.AWAY) {
        pts.set(awayId, (pts.get(awayId) ?? 0) + americano.pointsPerMatchWon)
      }
    }
  }

  return pts
}

/** Returns true when two competitors have already faced each other in any of the given matches. */
function havePlayedBefore(idA: number, idB: number, matches: Match[]): boolean {
  return matches.some(
    (match) =>
      match.awayCompetitorId != null &&
      ((match.homeCompetitorId === idA && match.awayCompetitorId === idB) ||
        (match.homeCompetitorId === idB && match.awayCompetitorId === idA))
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
    if (match.awayCompetitorId == null || match.homeCompetitorId == null) {
      continue
    }

    for (const id of [match.homeCompetitorId, match.awayCompetitorId]) {
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

  return pairs.map(([home, away], index) => ({ home, away, position: index }))
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
      const totalRounds = getTotalRounds(tournament.type, settings, competitorIds.length)

      if (roundNumber > totalRounds) {
        return 0
      }

      if (roundExistsIn(all, lane, roundNumber)) {
        return 0
      }

      // Unordered leagues lay the WHOLE round robin out in one go, so every
      // match exists — and accepts a result — from the moment the tournament
      // starts. Ordered leagues create exactly the one round they were asked
      // for, exactly as before.
      const lastRound = allowsUnorderedResults(tournament.type, settings) ? totalRounds : roundNumber
      let created = 0

      for (let number = roundNumber; number <= lastRound; number++) {
        if (roundExistsIn(all, lane, number)) {
          continue
        }

        const pairings = generateRoundPairings(tournament.type, settings, competitorIds, number, [])

        if (pairings.length === 0) {
          continue
        }

        await persistRoundMatches(tournamentCategoryId, number, lane, pairings)
        created = 1
      }

      return created
    }

    case TournamentType.AMERICANO: {
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

        if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
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

    case TournamentType.PLAYOFF: {
      const mainLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }
      let created = 0

      if (roundNumber === 1 && !roundExistsIn(all, mainLane, 1)) {
        created += await createKnockoutBracket(tournamentCategoryId, mainLane, competitorIds, 1)

        // Built alongside the main bracket, right from "Iniciar torneo": every
        // slot starts as "to be defined" and fills in progressively as the main
        // bracket produces its first-round losers (see advanceConsolationBracket).
        if (hasConsolationBracket(tournament.type, tournament.settings) && created > 0) {
          await createConsolationSkeleton(tournamentCategoryId, getBracketSize(competitorIds.length))
        }
      }

      return created
    }

    case TournamentType.INTERCLUBS: {
      const format = resolveInterclubsFormat(competitorIds.length)

      // Few teams: one zone, everybody against everybody, home and away.
      if (format.mode === InterclubsMode.DOUBLE_LEAGUE) {
        const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: null }

        if (roundNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
          return 0
        }

        if (roundExistsIn(all, lane, roundNumber)) {
          return 0
        }

        const pairings = generateInterclubsRoundRobinRound(competitorIds, roundNumber, all, true)

        if (pairings.length === 0) {
          return 0
        }

        await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)

        return 1
      }

      const groupPhaseRounds = getGroupPhaseRounds(settings, competitorIds.length, tournament.type)

      if (roundNumber <= groupPhaseRounds) {
        const groups = await computeCategoryGroups(
          tournamentCategoryId,
          competitorIds,
          settings,
          undefined,
          tournament.type
        )
        let created = 0
        // Localía spans the whole category, so every zone of this round sees the
        // matches the previous zones just produced.
        let known = [...all]

        for (let index = 0; index < groups.length; index++) {
          const group = groups[index]

          if (group.length < 2 || roundNumber > roundRobinRoundsFor(group.length)) {
            continue
          }

          const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: index }

          if (roundExistsIn(all, lane, roundNumber)) {
            continue
          }

          const pairings = generateInterclubsRoundRobinRound(group, roundNumber, known, false)

          if (pairings.length === 0) {
            continue
          }

          const persisted = await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)

          known = [...known, ...persisted]
          created++
        }

        return created
      }

      // First knockout round: seed the bracket from the final zone standings.
      if (roundNumber === groupPhaseRounds + 1) {
        const knockoutLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }

        if (roundExistsIn(all, knockoutLane, roundNumber)) {
          return 0
        }

        const { seeded, groupOf } = await computeGroupsKnockoutSeeds(
          tournamentCategoryId,
          competitorIds,
          settings,
          undefined,
          tournament.type
        )

        return createKnockoutBracket(tournamentCategoryId, knockoutLane, seeded, groupPhaseRounds + 1, true, groupOf)
      }

      return 0
    }

    case TournamentType.GROUPS_PLAYOFF: {
      const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings)
      const groupPhaseRounds = getGroupPhaseRoundsFromSizes(
        settings,
        groups.map((group) => group.length)
      )

      if (roundNumber <= groupPhaseRounds) {
        // Same deal as an unordered league, one round robin per group. The
        // knockout phase is untouched: it is still seeded once every group has
        // played itself out.
        const unordered = allowsUnorderedResults(tournament.type, settings)
        let created = 0

        for (let index = 0; index < groups.length; index++) {
          const group = groups[index]
          const groupRounds = Math.min(roundRobinRoundsFor(group.length), groupPhaseRounds)

          if (group.length < 2 || roundNumber > groupRounds) {
            continue
          }

          const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: index }
          const lastRound = unordered ? groupRounds : roundNumber
          let groupCreated = false

          for (let number = roundNumber; number <= lastRound; number++) {
            if (roundExistsIn(all, lane, number)) {
              continue
            }

            const pairings = generateRoundRobinRound(group, number)

            if (pairings.length === 0) {
              continue
            }

            await persistRoundMatches(tournamentCategoryId, number, lane, pairings)
            groupCreated = true
          }

          if (groupCreated) {
            created++
          }
        }

        return created
      }

      // First knockout round: build the whole bracket from the group standings.
      if (roundNumber === groupPhaseRounds + 1) {
        const knockoutLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }

        if (roundExistsIn(all, knockoutLane, roundNumber)) {
          return 0
        }

        // A single group also gets a bracket: its standings seed a knockout that
        // decides the title, even when that replays a pairing the group already
        // played. `createKnockoutBracket` bails on its own below 2 qualifiers.
        const { seeded, groupOf } = await computeGroupsKnockoutSeeds(tournamentCategoryId, competitorIds, settings)

        return createKnockoutBracket(tournamentCategoryId, knockoutLane, seeded, groupPhaseRounds + 1, false, groupOf)
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

  // Group lane of a groups+playoff (or interclubes) tournament: round robin
  // inside the group.
  if (lane.groupNumber != null) {
    const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache, tournament.type)
    const group = groups[lane.groupNumber] ?? []
    // The group phase can be capped short of its natural round-robin length
    // (groups+playoff's `maxRounds`), in which case every group's lane stops at
    // the same round regardless of its own size. Measured over the groups in
    // play rather than the competitor count, so a late entrant cannot change it.
    const groupPhaseRounds = getGroupPhaseRoundsFromSizes(
      settings,
      groups.map((each) => each.length),
      tournament.type
    )
    const groupRounds = Math.min(roundRobinRoundsFor(group.length), groupPhaseRounds)

    if (group.length < 2 || nextNumber > groupRounds) {
      return null
    }

    const pairings =
      tournament.type === TournamentType.INTERCLUBS
        ? generateInterclubsRoundRobinRound(group, nextNumber, all, false)
        : generateRoundRobinRound(group, nextNumber)

    return pairings.length > 0 ? persistRoundMatches(tournamentCategoryId, nextNumber, lane, pairings) : null
  }

  // Plain league / americano lane.
  if (nextNumber > getTotalRounds(tournament.type, settings, competitorIds.length)) {
    return null
  }

  // Interclubes single zone: home and away, with the localía rotation.
  if (tournament.type === TournamentType.INTERCLUBS) {
    const pairings = generateInterclubsRoundRobinRound(competitorIds, nextNumber, all, true)

    return pairings.length > 0 ? persistRoundMatches(tournamentCategoryId, nextNumber, lane, pairings) : null
  }

  let pairings: Pairing[]

  if (tournament.type === TournamentType.AMERICANO) {
    const allMatches = laneMatches(all, lane)

    if (isFullAmericanoRoundRobin(settings, competitorIds.length)) {
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

  // So are unordered round-robin lanes: the whole schedule already exists, so
  // there is no next round to build. They progress by voiding the fixtures of
  // competitors that reached their quota (see syncUnorderedVoids).
  if (allowsUnorderedResults(tournament.type, tournament.settings)) {
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
 * Enforces the per-competitor match quota of an unordered round-robin lane by
 * voiding the fixtures that can no longer be played.
 *
 * With no active round it is the organizer who decides which matches actually
 * happen, so the quota (`matchesPerCompetitor`) cannot be imposed by scheduling
 * fewer rounds — the complete round robin is on the table from the start.
 * Instead, every fixture is re-checked against the quota on each pass:
 *
 *  - a PENDING fixture with a side that already reached the quota can never be
 *    played, so it becomes VOID;
 *  - a VOID fixture whose two sides are back under the quota becomes PENDING
 *    again, so correcting a result gives back the fixtures it had consumed.
 *
 * This is pure derived state — recomputed from the lane's resolved matches
 * every time, never accumulated — so it is idempotent and independent of the
 * order results came in.
 *
 * A competitor CAN run out of opponents before reaching the quota, when
 * everybody else filled up first. That is deliberate rather than a case to
 * prevent: having nobody left to play against is treated exactly like having
 * completed the quota — the competitor just finishes with fewer points — and
 * the lane still closes, because nothing is left PENDING.
 *
 * Returns true when it changed something.
 */
async function syncUnorderedVoids(
  tournament: Tournament,
  tournamentCategoryId: number,
  lane: RoundLane,
  cache?: AdvanceCache
): Promise<boolean> {
  if (isKnockoutType(lane.type) || !allowsUnorderedResults(tournament.type, tournament.settings)) {
    return false
  }

  const quota = matchesPerCompetitor(tournament.settings)

  // No quota means the whole round robin is played: nothing is ever voided.
  if (quota == null) {
    return false
  }

  const all = await loadCategoryMatches(tournamentCategoryId, cache)
  const matches = laneMatches(all, lane)
  const played = new Map<number, number>()

  for (const match of matches) {
    // Only resolved, real matchups consume quota — a VOID one never happened.
    if (match.status === MatchStatus.PENDING || match.status === MatchStatus.VOID || match.awayCompetitorId == null) {
      continue
    }

    for (const competitorId of [match.homeCompetitorId, match.awayCompetitorId]) {
      if (competitorId != null) {
        played.set(competitorId, (played.get(competitorId) ?? 0) + 1)
      }
    }
  }

  const isFull = (id: number | null): boolean => id != null && (played.get(id) ?? 0) >= quota
  let changed = false

  for (const match of matches) {
    // Anything already resolved is history and is never revisited.
    if (match.status !== MatchStatus.PENDING && match.status !== MatchStatus.VOID) {
      continue
    }

    const status =
      isFull(match.homeCompetitorId) || isFull(match.awayCompetitorId) ? MatchStatus.VOID : MatchStatus.PENDING

    if (match.status === status) {
      continue
    }

    match.status = status
    match.updatedAt = new Date()
    await match.save()
    changed = true
  }

  if (changed) {
    cache?.invalidate(tournamentCategoryId)
  }

  return changed
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
  const isInterclubs = tournament.type === TournamentType.INTERCLUBS

  if (tournament.type !== TournamentType.GROUPS_PLAYOFF && !isInterclubs) {
    return false
  }

  // An interclubes small enough to be a home-and-away league has no knockout.
  if (isInterclubs && resolveInterclubsFormat(competitorIds.length).mode === InterclubsMode.DOUBLE_LEAGUE) {
    return false
  }

  const knockoutLane: RoundLane = { type: MatchType.BRACKET, groupNumber: null }
  const all = await loadCategoryMatches(tournamentCategoryId, cache)

  if (laneExistsIn(all, knockoutLane)) {
    return false
  }

  const settings = tournament.settings ?? {}
  const groups = await computeCategoryGroups(tournamentCategoryId, competitorIds, settings, cache, tournament.type)
  // Rounds actually owed by each group: its natural round-robin length, or
  // fewer when the group phase is capped short (groups+playoff's `maxRounds`).
  const groupPhaseRounds = getGroupPhaseRoundsFromSizes(
    settings,
    groups.map((group) => group.length),
    tournament.type
  )

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index]

    if (group.length < 2) {
      continue
    }

    const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: index }
    const groupRoundNumbers = laneRoundNumbers(all, lane)
    const groupRounds = Math.min(roundRobinRoundsFor(group.length), groupPhaseRounds)

    // The group must have materialised all of its rounds and resolved them all.
    if (groupRoundNumbers.length < groupRounds) {
      return false
    }

    if (laneMatches(all, lane).some((match) => match.status === MatchStatus.PENDING)) {
      return false
    }
  }

  const { seeded, groupOf } = await computeGroupsKnockoutSeeds(
    tournamentCategoryId,
    competitorIds,
    settings,
    cache,
    tournament.type
  )
  const startNumber = groupPhaseRounds + 1
  const created = await createKnockoutBracket(
    tournamentCategoryId,
    knockoutLane,
    seeded,
    startNumber,
    tournament.type === TournamentType.INTERCLUBS,
    groupOf,
    cache
  )

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

      // 1. Advance every existing round-robin lane independently. An unordered
      // lane has no round to advance: it moves by voiding the fixtures of the
      // competitors that already played their quota, which must happen before
      // the joins below read "is this lane done?".
      const lanes = getCategoryLanes(await loadCategoryMatches(category.id, cache))

      for (const lane of lanes) {
        if (await syncUnorderedVoids(tournament, category.id, lane, cache)) {
          progressed = true
        }

        if (await advanceLane(tournament, category.id, lane, competitorIds, cache)) {
          progressed = true
        }
      }

      // 2. Cross-lane joins (groups → knockout, and the consolation bracket).
      if (await maybeStartGroupsKnockout(tournament, category.id, competitorIds, cache)) {
        progressed = true
      }

      if (hasConsolationBracket(tournament.type, tournament.settings)) {
        if (await advanceConsolationBracket(category.id, cache)) {
          progressed = true
        }
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
    case TournamentType.AMERICANO: {
      const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber: null }

      await rebuildLaneFrom(tournament, tournamentCategoryId, lane, editedMatch.roundNumber + 1)
      break
    }

    case TournamentType.INTERCLUBS:

    case TournamentType.GROUPS_PLAYOFF: {
      // A group-phase edit can change who qualifies → drop the knockout so it is
      // reseeded. Only reachable while the knockout holds no results yet.
      if (editedMatch.type === MatchType.LEAGUE && editedMatch.groupNumber != null) {
        await deleteLane(tournamentCategoryId, { type: MatchType.BRACKET, groupNumber: null })
      }

      break
    }

    case TournamentType.PLAYOFF: {
      // A main-bracket edit can change who drops to the consolation bracket
      // (when settings.consolationBracket is on). Only rebuild it when it holds
      // no results yet (never clobber a played match) — the skeleton is cheap to
      // recreate since nothing has happened in it yet; advanceConsolationBracket
      // re-resolves whatever slots are already known.
      if (hasConsolationBracket(tournament.type, tournament.settings) && editedMatch.type === MatchType.BRACKET) {
        const consolationLane: RoundLane = { type: MatchType.CONSOLATION_BRACKET, groupNumber: null }
        const all = await loadCategoryMatches(tournamentCategoryId)

        if (laneExistsIn(all, consolationLane) && !laneHasResultsIn(all, consolationLane)) {
          await deleteLane(tournamentCategoryId, consolationLane)

          const competitorIds = await getSortedCompetitorIds(tournament, tournamentCategoryId)

          await createConsolationSkeleton(tournamentCategoryId, getBracketSize(competitorIds.length))
        }
      }

      break
    }

    default:
      // LEAGUE: nothing extra; syncKnockoutNextRound handles brackets.
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

  if (match.type === MatchType.CONSOLATION_BRACKET) {
    // Void-aware: a feeder can be a genuine winner OR a permanently empty slot
    // (see MatchStatus.VOID), which plain syncKnockoutNextRound doesn't model.
    await syncConsolationNextRound(match.tournamentCategoryId, match.roundNumber)
  } else if (isKnockoutType(match.type)) {
    await syncKnockoutNextRound(
      match.tournamentCategoryId,
      lane,
      match.roundNumber,
      undefined,
      tournament.type === TournamentType.INTERCLUBS
    )
  }

  if (wasAlreadyResolved) {
    await regenerateDownstreamRounds(tournament, match)
  }

  // Only the edited match's category can advance from a single result.
  await advanceTournament(tournament, match.tournamentCategoryId)
}

/** Order-insensitive key of a matchup, so a fixture can be recognised however its sides are stored. */
function pairKeyOf(home: number | null, away: number | null): string {
  return [home, away]
    .filter((id): id is number => id != null)
    .sort((a, b) => a - b)
    .join(':')
}

/**
 * Slots a competitor that registered AFTER the tournament started into the hole
 * of the structure they were accepted for. `slot` must come from
 * `getLateRegistrationSlots` — the caller re-derives it against fresh state, so
 * this function can take it as already validated.
 *
 * Nothing here grows or re-seeds a structure: it only fills what was already
 * empty. See utils/lateRegistration for why those are the only two shapes of
 * hole a running tournament has.
 */
export async function attachLateCompetitor(
  tournament: Tournament,
  competitor: Competitor,
  slot: LateRegistrationSlot
): Promise<void> {
  const tournamentCategoryId = competitor.tournamentCategoryId

  if (slot.kind === LateRegistrationSlotKind.BYE) {
    await fillKnockoutBye(tournament, tournamentCategoryId, Number(slot.matchId), competitor.id)
  } else {
    await joinRoundRobin(tournament, competitor, slot.groupNumber)
  }

  await advanceTournament(tournament, tournamentCategoryId)
}

/**
 * Turns an unopposed first-round knockout match into a real one, with the late
 * entrant as its away side.
 *
 * The bye was stored as already won, so its occupant had been propagated into
 * the next round. Re-running the winner propagation over the whole lane walks
 * that back: with the match no longer decided, the slot it fed is written back
 * to "to be defined". `getLateRegistrationSlots` only ever offers a bye whose
 * next match is still PENDING, so nothing that actually happened is undone.
 */
async function fillKnockoutBye(
  tournament: Tournament,
  tournamentCategoryId: number,
  matchId: number,
  competitorId: number
): Promise<void> {
  const match = await Match.find(matchId)

  if (!match || match.tournamentCategoryId !== tournamentCategoryId) {
    throw new ApiException('El bye seleccionado no pertenece a esta categoría')
  }

  match.awayCompetitorId = competitorId
  match.status = MatchStatus.PENDING
  match.winner = null
  match.score = null
  match.updatedAt = new Date()
  await match.save()

  const lane: RoundLane = { type: match.type, groupNumber: null }
  const roundNumbers = laneRoundNumbers(await loadCategoryMatches(tournamentCategoryId), lane)

  for (const roundNumber of roundNumbers.slice(0, -1)) {
    await syncKnockoutNextRound(tournamentCategoryId, lane, roundNumber)
  }

  // The consolation bracket mirrors the main one's first round, so the entrant
  // changes which slot it is owed: re-resolve it from the (now different) state.
  if (hasConsolationBracket(tournament.type, tournament.settings)) {
    await advanceConsolationBracket(tournamentCategoryId)
  }
}

/**
 * Adds a late entrant to a running round-robin lane — a group of a groups+playoff
 * group phase (`groupNumber` set), or the single lane of a league (null) — and
 * materialises the fixtures they are owed.
 *
 * Which placement applies depends on what a round means in that lane; see
 * utils/lateRegistration for why both are structure-preserving.
 */
async function joinRoundRobin(
  tournament: Tournament,
  competitor: Competitor,
  groupNumber: number | null
): Promise<void> {
  const tournamentCategoryId = competitor.tournamentCategoryId
  const categoryCompetitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const lane: RoundLane = { type: MatchType.LEAGUE, groupNumber }
  let members: number[]

  if (groupNumber == null) {
    // A league's lane is the whole category, ordered by id — and the entrant,
    // being the newest row, already sits at the end of it.
    members = sortCompetitorIds(categoryCompetitors, tournament.type)
  } else {
    // The entrant's own row already exists but carries no membership yet, which
    // would make the whole category read as "not frozen": the groups are read
    // back from everybody else.
    const groups = storedGroupMembership(categoryCompetitors.filter((each) => each.id !== competitor.id))

    if (!groups || !groups[groupNumber]) {
      throw new ApiException('El grupo seleccionado no es válido')
    }

    competitor.data = { ...(competitor.data ?? {}), groupNumber, groupPosition: groups[groupNumber].length }
    await competitor.save()
    members = [...groups[groupNumber], competitor.id]
  }

  const all = await loadCategoryMatches(tournamentCategoryId)

  // A lane that was never materialised (a group left with a single member) is
  // built from scratch: the entrant is what finally makes it playable.
  if (laneRoundNumbers(all, lane).length === 0) {
    await buildLaneNextRound(
      tournament,
      tournamentCategoryId,
      lane,
      1,
      await getSortedCompetitorIds(tournament, tournamentCategoryId)
    )

    return
  }

  if (allowsUnorderedResults(tournament.type, tournament.settings)) {
    await appendUnorderedFixtures(tournamentCategoryId, lane, members, competitor.id)

    return
  }

  await reconcileOrderedRoundRobin(tournamentCategoryId, lane, members)
}

/**
 * Ordered lane: re-derives each already-materialised round from the grown member
 * list and reconciles it against what is stored.
 *
 * The entrant was appended to the lane's id array, which is exactly where the
 * circle method's null "bye" slot sat (the lane is odd — that is the condition
 * for the slot being offered at all), so every pairing the lane already had is
 * reproduced unchanged and the pairs that used to be skipped for involving the
 * null are now the entrant's.
 *
 * So rounds are reconciled rather than rebuilt: an existing fixture is kept and
 * only renumbered (the round now holds one more match), and the entrant's is
 * inserted alongside it, PENDING, in the round it belongs to — including rounds
 * that are otherwise finished, which `isMatchEditable` deliberately keeps open
 * for exactly this. Rounds not yet materialised need nothing: they will be
 * generated from the grown list.
 */
async function reconcileOrderedRoundRobin(
  tournamentCategoryId: number,
  lane: RoundLane,
  members: number[]
): Promise<void> {
  const all = await loadCategoryMatches(tournamentCategoryId)

  for (const roundNumber of laneRoundNumbers(all, lane)) {
    const existing = roundMatchesOf(all, lane, roundNumber)
    const byPair = new Map(existing.map((match) => [pairKeyOf(match.homeCompetitorId, match.awayCompetitorId), match]))
    const missing: Pairing[] = []

    for (const pairing of generateRoundRobinRound(members, roundNumber)) {
      const match = byPair.get(pairKeyOf(pairing.home, pairing.away))

      if (!match) {
        missing.push(pairing)

        continue
      }

      if (match.position !== pairing.position) {
        match.position = pairing.position
        match.updatedAt = new Date()
        await match.save()
      }
    }

    if (missing.length > 0) {
      await persistRoundMatches(tournamentCategoryId, roundNumber, lane, missing)
    }
  }
}

/**
 * Unordered lane: appends the entrant's fixtures without touching a single
 * existing one.
 *
 * Here a round is a display grouping, not a schedule, so the layout must NOT be
 * re-derived — doing so would relocate fixtures (including played ones) to
 * different rounds for no reason. Instead each new fixture goes into the
 * lowest-numbered round where both sides are still free, so nobody is booked
 * twice in the same round; when no round has space, one is appended at the end.
 *
 * On an odd lane this happens to reproduce exactly what the circle method would
 * have produced, because the free slots ARE the rest slots. On an even one it
 * simply grows the lane by the rounds it needs.
 */
async function appendUnorderedFixtures(
  tournamentCategoryId: number,
  lane: RoundLane,
  members: number[],
  competitorId: number
): Promise<void> {
  const all = await loadCategoryMatches(tournamentCategoryId)
  const existing = laneMatches(all, lane)
  const played = new Set(existing.map((match) => pairKeyOf(match.homeCompetitorId, match.awayCompetitorId)))
  /** Competitors already booked in each round, and where the next match of it goes. */
  const busy = new Map<number, Set<number>>()
  const nextPosition = new Map<number, number>()

  for (const match of existing) {
    const sides = busy.get(match.roundNumber) ?? new Set<number>()

    for (const side of [match.homeCompetitorId, match.awayCompetitorId]) {
      if (side != null) {
        sides.add(side)
      }
    }

    busy.set(match.roundNumber, sides)
    nextPosition.set(match.roundNumber, Math.max(nextPosition.get(match.roundNumber) ?? 0, match.position + 1))
  }

  const roundNumbers = [...busy.keys()].sort((a, b) => a - b)
  const additions = new Map<number, Pairing[]>()
  let lastRound = roundNumbers[roundNumbers.length - 1] ?? 0

  for (const rivalId of members) {
    if (rivalId === competitorId || played.has(pairKeyOf(rivalId, competitorId))) {
      continue
    }

    let target = roundNumbers.find((roundNumber) => {
      const sides = busy.get(roundNumber)!

      return !sides.has(rivalId) && !sides.has(competitorId)
    })

    if (target == null) {
      lastRound++
      target = lastRound
      roundNumbers.push(target)
      busy.set(target, new Set<number>())
      nextPosition.set(target, 0)
    }

    const position = nextPosition.get(target) ?? 0

    busy.get(target)!.add(rivalId)
    busy.get(target)!.add(competitorId)
    nextPosition.set(target, position + 1)
    additions.set(target, [...(additions.get(target) ?? []), { home: rivalId, away: competitorId, position }])
  }

  for (const [roundNumber, pairings] of [...additions.entries()].sort((a, b) => a[0] - b[0])) {
    await persistRoundMatches(tournamentCategoryId, roundNumber, lane, pairings)
  }
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
 * Normalizes the category ids picked by the organizer: keeps positive integers
 * only, in order, without duplicates. Returns null when there are none, which
 * is what tells createTournament to materialise a single "no category"
 * instance.
 */
export function normalizeCategoryIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const categoryIds: number[] = []

  for (const entry of value) {
    const id = Number(entry)

    if (!Number.isInteger(id) || id <= 0 || categoryIds.includes(id)) {
      continue
    }

    categoryIds.push(id)
  }

  return categoryIds.length > 0 ? categoryIds : null
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

/**
 * Whether a tournament is currently accepting registrations, evaluated in the
 * organization's `timeZone`.
 *
 * - No `startInscriptionsDate` set → always open (registrations are open since
 *   the tournament was created).
 * - Set → open from the start of that day (00:00) in the org's timezone, same
 *   convention as a start-of-day `startDate` in `isTournamentStartDue`.
 *
 * `timeZone` is an IANA name (e.g. "America/Argentina/Buenos_Aires"); an
 * unknown/empty value is treated as UTC.
 */
export function isRegistrationOpen(tournament: Tournament, timeZone = 'UTC', now: Date = new Date()): boolean {
  if (!tournament.startInscriptionsDate) {
    return true
  }

  const opensAt = zonedWallTimeToInstant(tournament.startInscriptionsDate, '00:00', timeZone || 'UTC')

  // Unparseable startInscriptionsDate → don't block registration.
  if (Number.isNaN(opensAt.getTime())) {
    return true
  }

  return opensAt.getTime() <= now.getTime()
}

/** Maps each organization id to its configured IANA timezone (UTC when unset). */
export async function loadOrganizationTimezones(): Promise<Map<number, string>> {
  const organizations = await Organization.get()

  return new Map(organizations.map((organization) => [organization.id, organization.timezone || 'UTC']))
}
