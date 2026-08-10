import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { roundLabel } from '@/app/(protected)/(tournaments)/utils/bracket'
import {
  computeGroupMembership,
  GroupableCompetitor,
  sortCompetitorIds,
  storedGroupMembership
} from '@/app/(protected)/(tournaments)/utils/groups'
import { generateRoundRobinRound } from '@/app/(protected)/(tournaments)/utils/roundRobin'
import { allowsUnorderedResults } from '@/app/(protected)/(tournaments)/utils/settings'

/**
 * Late registration: adding a competitor to a tournament that has ALREADY
 * started.
 *
 * Once a tournament is ONGOING its structure is what is being played, and no
 * entrant may change it: the fixtures already generated must stay exactly as
 * they are, and the ones still to be generated must come out exactly as they
 * would have. So a late entrant is only accepted where the structure already has
 * a hole shaped like them — never by growing, re-seeding or reshuffling anything.
 *
 * There are exactly two such holes:
 *
 *  - A KNOCKOUT BYE. An entrant count that is not a power of two leaves the top
 *    seeds unopposed in the first round (stored as a WALKOVER with no away
 *    side). Filling that empty side turns the walkover into a real match and
 *    changes nothing else: the bracket's size, shape and every other pairing are
 *    untouched. Only while the bye's occupant has not already moved on — see
 *    `isFillableBye`.
 *
 *  - A ROUND-ROBIN LANE with room for one more: a group of a groups+playoff
 *    still in its group phase, or the single lane of a league. What counts as
 *    "room" depends on whether the lane's rounds are a SCHEDULE or just a
 *    LAYOUT (`allowUnorderedResults`):
 *
 *      · Ordered (the default) — the round is the schedule, so a fixture may
 *        never change rounds. Only an ODD round robin qualifies: the circle
 *        method pads it with a null slot that rests one competitor per round,
 *        and appending the entrant to the lane's id array puts them exactly
 *        there. That provably preserves every pairing the lane had (each pair
 *        that did not involve the null is unchanged; the ones that did are now
 *        the entrant's) AND its number of rounds — an odd round robin of size k
 *        needs as many rounds as the even one of size k+1 it becomes. The
 *        entrant simply picks up the matches nobody was playing.
 *
 *      · Unordered — the whole round robin exists up front and any match can be
 *        loaded at any time, so a round is a display grouping with no meaning of
 *        its own. Parity stops mattering: the complete round robin of a set is
 *        always contained in the complete round robin of that set plus one, so
 *        NO existing fixture changes at all. The entrant's matches are simply
 *        appended into rounds where both sides are still free.
 *
 * Everything else is refused. An americano pairs its later rounds from the
 * standings, so a new entrant rewrites rounds that depend on results already
 * loaded; an interclubes tournament derives its very format (zones, qualifiers,
 * home-and-away or not) from how many teams registered; and a groups+playoff
 * already in its knockout phase has a bracket that was seeded from final
 * standings the entrant took no part in.
 *
 * This module is deliberately pure and model-free: the admin page uses it to
 * decide what to offer, and the server uses the very same function to decide
 * what to accept, so the two can never disagree.
 */

/** What kind of hole in the structure a slot represents. */
export enum LateRegistrationSlotKind {
  /** An unopposed first-round knockout match whose empty side can be filled. */
  BYE = 'bye',
  /** A round-robin lane with room for one more competitor. */
  ROUND_ROBIN = 'round_robin'
}

/** A place where a competitor can be registered without altering the structure. */
export interface LateRegistrationSlot {
  tournamentCategoryId: number
  kind: LateRegistrationSlotKind
  /** BYE only: the walkover match whose empty side the entrant fills. */
  matchId: number | null
  /**
   * ROUND_ROBIN only: index of the group the entrant joins, or null for the
   * single lane of a league (which has no groups).
   */
  groupNumber: number | null
  /** Human description for the organizer ("Bye de Cuartos de final #2", "Grupo 3"). */
  label: string
}

/** Minimal match shape this module needs. Both `Match` and `MatchDto` satisfy it. */
export interface LateRegistrationMatch {
  id: number
  tournamentCategoryId: number
  roundNumber: number
  type: MatchType
  groupNumber: number | null
  position: number
  homeCompetitorId: number | null
  awayCompetitorId: number | null
  status: MatchStatus
}

/** Minimal competitor shape this module needs. Both `Competitor` and `CompetitorDto` satisfy it. */
export interface LateRegistrationCompetitor extends GroupableCompetitor {
  tournamentCategoryId: number
}

/** Minimal tournament shape this module needs. Both `Tournament` and `TournamentDto` satisfy it. */
export interface LateRegistrationTournament {
  status: TournamentStatus
  type: TournamentType
  settings: TournamentSettings | null
}

/** Minimal category shape this module needs. */
export interface LateRegistrationCategory {
  id: number
  maxCompetitors: number
}

/**
 * Matches of one lane (type + group index) of a category.
 *
 * Exported for utils/lateRemoval, which reasons about the very same lanes from
 * the opposite direction (a competitor LEAVING one).
 */
export function laneOf(matches: LateRegistrationMatch[], type: MatchType, groupNumber: number | null = null) {
  return matches.filter((match) => match.type === type && (match.groupNumber ?? null) === groupNumber)
}

/** Ascending round numbers present in a set of matches. Exported for utils/lateRemoval. */
export function roundNumbersOf(matches: LateRegistrationMatch[]): number[] {
  return [...new Set(matches.map((match) => match.roundNumber))].sort((a, b) => a - b)
}

/**
 * Whether a first-round bye can still be turned into a real match.
 *
 * A bye is stored as already won, so its occupant is already sitting in the next
 * round. Filling it un-decides that: the occupant now has to play, and the slot
 * they were propagated into must go back to "to be defined" (the engine does
 * this by re-running the winner propagation). That is only honest while nothing
 * downstream has happened yet, so the match the bye feeds must still be PENDING.
 *
 * With a consolation bracket the same reasoning extends one lane further: the
 * consolation slot that mirrors this bracket position must not have resolved
 * either. In practice it cannot have, since it only resolves once the bye's
 * round-2 match is played, but it is checked rather than assumed — a stale or
 * hand-edited row must fail closed, not corrupt a bracket.
 */
function isFillableBye(bye: LateRegistrationMatch, matches: LateRegistrationMatch[]): boolean {
  if (bye.status !== MatchStatus.WALKOVER || bye.awayCompetitorId != null || bye.homeCompetitorId == null) {
    return false
  }

  const mainLane = laneOf(matches, MatchType.BRACKET)
  const rounds = roundNumbersOf(mainLane)
  const index = rounds.indexOf(bye.roundNumber)

  // Byes only ever exist in the first round of a bracket; anything else is not
  // a bye but an unresolved slot this module has no business touching.
  if (index !== 0) {
    return false
  }

  const nextNumber = rounds[1]

  // A 2-entrant bracket is a single match: there is no round beyond it, so
  // there is nothing downstream that could already have happened.
  if (nextNumber != null) {
    const parent = mainLane.find(
      (match) => match.roundNumber === nextNumber && match.position === Math.floor(bye.position / 2)
    )

    if (parent && parent.status !== MatchStatus.PENDING) {
      return false
    }
  }

  const consolationLane = laneOf(matches, MatchType.CONSOLATION_BRACKET)

  if (consolationLane.length > 0) {
    const firstNumber = roundNumbersOf(consolationLane)[0]
    const mirror = consolationLane.find(
      (match) => match.roundNumber === firstNumber && match.position === Math.floor(bye.position / 2)
    )

    if (mirror && mirror.status !== MatchStatus.PENDING) {
      return false
    }
  }

  return true
}

/**
 * Whether a groups+playoff category is still in its group phase, i.e. the
 * knockout has not been seeded yet.
 *
 * The bracket is built the instant every group finishes (see
 * `maybeStartGroupsKnockout`, which runs synchronously after each result), so
 * its absence is the phase marker. The "no group match left pending" check is
 * the same condition read from the other side: it fails closed in the window —
 * or after a failed write — where the groups are done but the bracket is not
 * there yet, rather than accepting an entrant into a phase that is over.
 */
export function isInGroupPhase(matches: LateRegistrationMatch[]): boolean {
  if (laneOf(matches, MatchType.BRACKET).length > 0) {
    return false
  }

  const groupMatches = matches.filter((match) => match.type === MatchType.LEAGUE && match.groupNumber != null)

  // A category that materialised NOTHING never got going in the first place —
  // a tournament starts every category it can, and skips the ones left with a
  // single competitor (see `materializeRound`). It has not reached any phase
  // yet, so it is still waiting at the start of its group phase, and it is the
  // safest case of all to let somebody into: there is no fixture to preserve.
  if (groupMatches.length === 0) {
    return true
  }

  return groupMatches.some((match) => match.status === MatchStatus.PENDING)
}

/**
 * Order-insensitive key of a matchup, so a fixture is recognised however its
 * sides are stored. Exported for utils/lateRemoval, which diffs the very same
 * derivations against the very same stored fixtures.
 */
export function pairKeyOf(home: number | null, away: number | null): string {
  return [home, away]
    .filter((id): id is number => id != null)
    .sort((a, b) => a - b)
    .join(':')
}

/**
 * Whether re-deriving a category's group membership from scratch reproduces the
 * groups that are ACTUALLY being played.
 *
 * Membership is normally frozen when the tournament starts, but tournaments that
 * were already under way when that was introduced carry nothing — and refusing
 * them forever is worse than checking. The derivation is deterministic, so for a
 * category whose competitors have not changed since it started it reproduces the
 * original split exactly; this is what proves it, against the matches themselves:
 *
 *  1. Every materialised fixture must sit in the group the derivation puts BOTH
 *     of its sides in. A single fixture in the wrong lane means the split drifted.
 *  2. An ordered lane additionally depends on the ORDER inside each group — the
 *     circle method derives every pairing from it — so each materialised round
 *     must come out with exactly the fixtures it already holds. An unordered lane
 *     needs no such check: nothing ever re-derives its layout, and a late entrant
 *     only reads the membership as a set of rivals.
 *
 * A category with no group fixtures yet has nothing to contradict, so it passes.
 */
function derivationReproducesPlay(
  groups: number[][],
  categoryMatches: LateRegistrationMatch[],
  unordered: boolean
): boolean {
  const groupOf = new Map<number, number>()

  groups.forEach((group, index) => group.forEach((id) => groupOf.set(id, index)))

  const groupMatches = categoryMatches.filter((match) => match.type === MatchType.LEAGUE && match.groupNumber != null)

  if (groupMatches.length === 0) {
    return true
  }

  for (const match of groupMatches) {
    for (const side of [match.homeCompetitorId, match.awayCompetitorId]) {
      if (side != null && groupOf.get(side) !== match.groupNumber) {
        return false
      }
    }
  }

  if (unordered) {
    return true
  }

  for (let groupNumber = 0; groupNumber < groups.length; groupNumber++) {
    const lane = groupMatches.filter((match) => match.groupNumber === groupNumber)

    for (const roundNumber of new Set(lane.map((match) => match.roundNumber))) {
      const stored = new Set(
        lane
          .filter((match) => match.roundNumber === roundNumber)
          .map((match) => pairKeyOf(match.homeCompetitorId, match.awayCompetitorId))
      )
      const derived = generateRoundRobinRound(groups[groupNumber], roundNumber).map((pairing) =>
        pairKeyOf(pairing.home, pairing.away)
      )

      if (derived.length !== stored.size || derived.some((key) => !stored.has(key))) {
        return false
      }
    }
  }

  return true
}

/**
 * The group membership of a category that can be TRUSTED to be the one being
 * played: the frozen one when it is there, otherwise a re-derivation that has
 * been verified against the matches (see `derivationReproducesPlay`). Null when
 * neither is available, which closes the category to late registration.
 *
 * Exported because the server writes the result back onto the competitors when
 * it accepts an entrant (`freezeGroupMembership`), so a repaired category is
 * only ever repaired once — and with exactly what was verified here.
 */
export function resolveGroupMembership(
  competitors: LateRegistrationCompetitor[],
  categoryMatches: LateRegistrationMatch[],
  settings: TournamentSettings | null,
  unordered: boolean
): number[][] | null {
  const stored = storedGroupMembership(competitors)

  if (stored) {
    return stored
  }

  const derived = computeGroupMembership(competitors, settings, TournamentType.GROUPS_PLAYOFF)

  return derivationReproducesPlay(derived, categoryMatches, unordered) ? derived : null
}

/**
 * Whether a round-robin lane of `memberCount` competitors can take one more
 * without any existing fixture changing.
 *
 * The lane must still have something left to play: a round robin whose every
 * match is resolved (or voided, once everybody hit their per-competitor quota)
 * is a finished competition, not one with room.
 *
 * Beyond that it comes down to what a round MEANS in this lane — see the module
 * docblock. Ordered: only an odd round robin has a rest slot to take over.
 * Unordered: rounds are a layout, so any size works and nothing moves.
 */
function roundRobinLaneAcceptsEntrant(
  laneMatches: LateRegistrationMatch[],
  memberCount: number,
  unordered: boolean
): boolean {
  if (memberCount === 0) {
    return false
  }

  // A lane that was never materialised — a group left with a single member, too
  // small to play — is a hole by definition: there is nothing in it to disturb,
  // and the entrant is what finally makes it playable.
  if (laneMatches.length === 0) {
    return memberCount === 1
  }

  if (!laneMatches.some((match) => match.status === MatchStatus.PENDING)) {
    return false
  }

  return unordered || memberCount % 2 === 1
}

/**
 * Every place a competitor can still be registered in an ONGOING category
 * without altering its structure. Empty means the category is closed to new
 * entrants — which is the normal case, not an error.
 *
 * `matches` and `competitors` must be those of `category` (extra rows are
 * ignored, missing ones would simply hide slots).
 */
export function getLateRegistrationSlots(
  tournament: LateRegistrationTournament,
  category: LateRegistrationCategory,
  matches: LateRegistrationMatch[],
  competitors: LateRegistrationCompetitor[]
): LateRegistrationSlot[] {
  if (tournament.status !== TournamentStatus.ONGOING) {
    return []
  }

  const categoryMatches = matches.filter((match) => match.tournamentCategoryId === category.id)
  const categoryCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === category.id)

  // The entry limit the organizer set still applies: a late entrant is an
  // entrant like any other.
  if (categoryCompetitors.length >= category.maxCompetitors) {
    return []
  }

  if (tournament.type === TournamentType.PLAYOFF) {
    const mainLane = laneOf(categoryMatches, MatchType.BRACKET)
    const firstNumber = roundNumbersOf(mainLane)[0]

    if (firstNumber == null) {
      return []
    }

    const totalRounds = roundNumbersOf(mainLane).length
    const firstRoundCount = mainLane.filter((match) => match.roundNumber === firstNumber).length

    return mainLane
      .filter((match) => match.roundNumber === firstNumber && isFillableBye(match, categoryMatches))
      .sort((a, b) => a.position - b.position)
      .map((match) => ({
        tournamentCategoryId: category.id,
        kind: LateRegistrationSlotKind.BYE,
        matchId: match.id,
        groupNumber: null,
        label: `Bye de ${roundLabel(0, totalRounds, firstRoundCount)} #${match.position + 1}`
      }))
  }

  const unordered = allowsUnorderedResults(tournament.type, tournament.settings)

  if (tournament.type === TournamentType.LEAGUE) {
    // A league is a single round-robin lane over the whole category, so its
    // membership needs no freezing: `sortCompetitorIds` orders a league by id,
    // and a new competitor always has the highest one — it lands at the end of
    // the list on its own, which is exactly the rest slot.
    const lane = laneOf(categoryMatches, MatchType.LEAGUE)

    if (!roundRobinLaneAcceptsEntrant(lane, categoryCompetitors.length, unordered)) {
      return []
    }

    return [
      {
        tournamentCategoryId: category.id,
        kind: LateRegistrationSlotKind.ROUND_ROBIN,
        matchId: null,
        groupNumber: null,
        label: 'Fixture de la liga'
      }
    ]
  }

  if (tournament.type === TournamentType.GROUPS_PLAYOFF) {
    if (!isInGroupPhase(categoryMatches)) {
      return []
    }

    // The membership has to be the one actually being played, or a new entrant
    // would reshuffle groups already under way: frozen at start, or re-derived
    // and verified against the matches for a tournament that started before the
    // freezing existed (see `resolveGroupMembership`).
    const groups = resolveGroupMembership(categoryCompetitors, categoryMatches, tournament.settings, unordered)

    if (!groups) {
      return []
    }

    return groups
      .map((group, groupNumber) => ({ group, groupNumber }))
      .filter(({ group, groupNumber }) =>
        roundRobinLaneAcceptsEntrant(laneOf(categoryMatches, MatchType.LEAGUE, groupNumber), group.length, unordered)
      )
      .map(({ groupNumber }) => ({
        tournamentCategoryId: category.id,
        kind: LateRegistrationSlotKind.ROUND_ROBIN,
        matchId: null,
        groupNumber,
        label: `Grupo ${groupNumber + 1}`
      }))
  }

  // AMERICANO pairs its later rounds from the standings and INTERCLUBS derives
  // its very format from the entry count: there is no structure-preserving place
  // to put anybody.
  return []
}

/**
 * Whether `slot` really has room for a competitor that ALREADY EXISTS — one
 * being moved from another category of the same tournament, rather than
 * registered from scratch.
 *
 * Every slot on offer assumes a BRAND-NEW entrant, and one slot leans on that
 * assumption: the single lane of an ordered league is ordered by competitor id
 * (`sortCompetitorIds`), so a fresh registration is by definition the highest id
 * and lands exactly on the circle method's rest slot. A competitor arriving from
 * another category keeps the id they were registered with, which can be lower
 * than the ids already in the lane — and then they do NOT land on the rest slot:
 * they are inserted in the middle of the order and re-pair the whole lane.
 *
 * So the arrival is verified the same way a departure is (see
 * `reproducesLaneWithout` in utils/lateRemoval): every materialised round of the
 * destination lane must come out of the grown lane exactly as it is stored, plus
 * the newcomer's own fixtures and nothing else. In practice that means the
 * mover's id has to be above every id in the destination league, which is
 * restrictive but honest — a league's fixture is its registration order, and
 * there is no way to insert somebody into the middle of one for free.
 *
 * Every other slot is id-independent and always accepts: a group appends the
 * newcomer at an explicit `groupPosition`, an unordered lane never re-derives
 * its layout, and a knockout bye is a named empty side.
 */
export function slotAcceptsRelocatedCompetitor(
  tournament: LateRegistrationTournament,
  slot: LateRegistrationSlot,
  matches: LateRegistrationMatch[],
  competitors: LateRegistrationCompetitor[],
  competitorId: number
): boolean {
  if (slot.kind !== LateRegistrationSlotKind.ROUND_ROBIN || slot.groupNumber != null) {
    return true
  }

  if (allowsUnorderedResults(tournament.type, tournament.settings)) {
    return true
  }

  const destination = competitors.filter(
    (competitor) => competitor.tournamentCategoryId === slot.tournamentCategoryId || competitor.id === competitorId
  )
  const members = sortCompetitorIds(destination, tournament.type)
  const lane = laneOf(
    matches.filter((match) => match.tournamentCategoryId === slot.tournamentCategoryId),
    MatchType.LEAGUE
  )

  for (const roundNumber of roundNumbersOf(lane)) {
    const stored = new Set(
      lane
        .filter((match) => match.roundNumber === roundNumber)
        .map((match) => pairKeyOf(match.homeCompetitorId, match.awayCompetitorId))
    )
    // The newcomer's own fixtures are the ones that get ADDED, so they are the
    // only derived pairings allowed not to be there already.
    const derived = generateRoundRobinRound(members, roundNumber)
      .filter((pairing) => pairing.home !== competitorId && pairing.away !== competitorId)
      .map((pairing) => pairKeyOf(pairing.home, pairing.away))

    if (derived.length !== stored.size || derived.some((key) => !stored.has(key))) {
      return false
    }
  }

  return true
}

/** Whether an ONGOING category accepts at least one more competitor. */
export function acceptsLateRegistration(
  tournament: LateRegistrationTournament,
  category: LateRegistrationCategory,
  matches: LateRegistrationMatch[],
  competitors: LateRegistrationCompetitor[]
): boolean {
  return getLateRegistrationSlots(tournament, category, matches, competitors).length > 0
}
