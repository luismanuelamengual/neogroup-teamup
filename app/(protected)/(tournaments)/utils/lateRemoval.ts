import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { resolveGroupQualifiers, sortCompetitorIds } from '@/app/(protected)/(tournaments)/utils/groups'
import {
  isInGroupPhase,
  laneOf,
  LateRegistrationCategory,
  LateRegistrationCompetitor,
  LateRegistrationMatch,
  LateRegistrationTournament,
  pairKeyOf,
  resolveGroupMembership,
  roundNumbersOf
} from '@/app/(protected)/(tournaments)/utils/lateRegistration'
import { generateRoundRobinRound } from '@/app/(protected)/(tournaments)/utils/roundRobin'
import { allowsUnorderedResults } from '@/app/(protected)/(tournaments)/utils/settings'

/**
 * Late removal: taking a competitor OUT of a tournament that has ALREADY
 * started — because the organizer is unregistering them, or moving them to
 * another category (which is a removal from one category followed by a late
 * registration into another).
 *
 * The mirror image of utils/lateRegistration, and held to a stricter promise.
 * Late registration accepts an entrant wherever the structure already has a hole
 * shaped like them. Removal is not allowed to LEAVE a hole: the competitor has
 * to come out without a trace, so that what remains is indistinguishable from
 * the same category with one competitor fewer. No walkover awarded to a rival,
 * no fixture that changes round, rival or meaning, no dangling bracket slot.
 * When that cannot be guaranteed, the competitor simply stays where they are.
 *
 * That rules out far more than it allows:
 *
 *  - A KNOCKOUT is closed, always. Taking a competitor out of a first-round
 *    match turns it into a bye and hands their rival a walkover they never
 *    played; taking out somebody who HAS a bye leaves the match it feeds with a
 *    side that can never be filled, deadlocking the bracket. Both are traces, so
 *    a playoff category admits no departures at all. (Symmetrically, this is why
 *    late registration into a bye is a hole-FILLING operation and has no inverse.)
 *
 *  - A ROUND-ROBIN LANE — a group of a groups+playoff still in its group phase,
 *    or the single lane of a league — can let somebody go, under the same
 *    reading of what a round MEANS that governs late registration:
 *
 *      · Ordered (the default) — the round is the schedule, so no fixture may
 *        change rounds. The circle method pads an odd lane with a null slot at
 *        the END of the id array, so the ONLY competitor that can leave without
 *        re-pairing everybody else is the one sitting exactly there: the last of
 *        an EVEN lane, whose departure turns it into the odd lane it would have
 *        been all along. Rather than assert that from the shape, it is checked
 *        against the fixtures themselves — every materialised round must come
 *        out of the shrunken lane exactly as it is stored, minus the departing
 *        competitor's own matches (`reproducesLaneWithout`). The round COUNT is
 *        preserved for free: an even round robin of size k needs as many rounds
 *        as the odd one of size k-1 it becomes.
 *
 *      · Unordered — the whole round robin exists up front and its rounds are a
 *        display grouping with no meaning of their own, so nothing is ever
 *        re-derived: deleting the departing competitor's fixtures leaves every
 *        other one exactly where it is. Any member of the lane may leave.
 *
 *  - An AMERICANO pairs its later rounds from the standings and an INTERCLUBES
 *    tournament derives its very format from how many teams registered, so
 *    neither has a departure that leaves nothing behind — exactly as neither has
 *    a hole that accepts an entrant.
 *
 * Two conditions apply on top of the format, whatever it is: the competitor must
 * not have PLAYED anything (a resolved match of theirs is a result that would be
 * erased), and their lane must not be left too small to play.
 *
 * Like its sibling this module is deliberately pure and model-free: the admin
 * page uses it to decide what to offer — and to explain what it does not — and
 * the server uses the very same function to decide what to accept, so the two
 * can never disagree.
 */

/** A round-robin lane with a single competitor cannot play: nobody may shrink one that far. */
const MIN_LANE_COMPETITORS = 2

/** Why a competitor cannot be taken out of a running tournament. */
export enum RemovalBlockReason {
  /** A match of theirs already holds a result. */
  PLAYED = 'played',
  /** They hold a bye and have already been propagated into the next round. */
  BYE = 'bye',
  /** The tournament's format has no departure that leaves nothing behind. */
  FORMAT = 'format',
  /** A groups+playoff whose knockout has already been seeded from the group standings. */
  PHASE = 'phase',
  /** The group membership actually being played could not be established. */
  MEMBERSHIP = 'membership',
  /** Their departure would re-pair the rest of the round robin. */
  PAIRINGS = 'pairings',
  /** Their lane would be left with fewer than two competitors. */
  LANE_SIZE = 'lane_size',
  /** Their group would send a different number of competitors to the knockout. */
  QUALIFIERS = 'qualifiers'
}

/** Whether a competitor may leave, and — when they may not — why, in the organizer's words. */
export interface RemovalCheck {
  removable: boolean
  reason: RemovalBlockReason | null
  /** Ready-to-show sentence explaining the refusal. Null when removable. */
  message: string | null
}

const REMOVABLE: RemovalCheck = { removable: true, reason: null, message: null }

function refuse(reason: RemovalBlockReason, message: string): RemovalCheck {
  return { removable: false, reason, message }
}

/** The formats that have no structure-preserving departure at all, with the reason why. */
const CLOSED_FORMATS: Partial<Record<TournamentType, string>> = {
  [TournamentType.PLAYOFF]:
    'En una llave, sacar a un competidor le daría a su rival un walkover que nunca jugó. No se puede sin alterar el cuadro.',
  [TournamentType.AMERICANO]:
    'Un americano arma sus rondas desde las posiciones, así que sacar a un competidor reescribiría rondas que dependen de resultados ya cargados.',
  [TournamentType.INTERCLUBS]:
    'El formato de un torneo de interclubes (zonas, clasificados, ida y vuelta) se deriva de la cantidad de equipos inscriptos, así que sacar uno lo cambiaría entero.'
}

/**
 * Whether the fixtures a round-robin lane already holds are exactly what the
 * lane WITHOUT `competitorId` produces — the proof that their departure re-pairs
 * nobody.
 *
 * Every materialised round is re-derived from the shrunken member list and
 * diffed against what is stored, ignoring the departing competitor's own
 * matches (those are the ones that go away). Rounds not yet materialised need no
 * check: they will be generated from the shrunken list to begin with.
 */
function reproducesLaneWithout(laneMatches: LateRegistrationMatch[], members: number[], competitorId: number): boolean {
  const remaining = members.filter((id) => id !== competitorId)

  for (const roundNumber of roundNumbersOf(laneMatches)) {
    const stored = new Set(
      laneMatches
        .filter(
          (match) =>
            match.roundNumber === roundNumber &&
            match.homeCompetitorId !== competitorId &&
            match.awayCompetitorId !== competitorId
        )
        .map((match) => pairKeyOf(match.homeCompetitorId, match.awayCompetitorId))
    )
    const derived = generateRoundRobinRound(remaining, roundNumber).map((pairing) =>
      pairKeyOf(pairing.home, pairing.away)
    )

    if (derived.length !== stored.size || derived.some((key) => !stored.has(key))) {
      return false
    }
  }

  return true
}

/**
 * Whether a competitor may leave a round-robin lane. See the module docblock for
 * why an ordered lane only lets go of the competitor sitting on the circle
 * method's rest slot, while an unordered one lets go of anybody.
 */
function canLeaveRoundRobinLane(
  laneMatches: LateRegistrationMatch[],
  members: number[],
  competitorId: number,
  unordered: boolean,
  laneLabel: string
): RemovalCheck {
  if (members.length - 1 < MIN_LANE_COMPETITORS) {
    return refuse(
      RemovalBlockReason.LANE_SIZE,
      `Sin este competidor ${laneLabel} quedaría con menos de dos competidores y no se podría jugar.`
    )
  }

  // A lane whose rounds are a display grouping never re-derives its layout, so
  // removing a competitor's fixtures moves nothing.
  if (unordered) {
    return REMOVABLE
  }

  if (!reproducesLaneWithout(laneMatches, members, competitorId)) {
    return refuse(
      RemovalBlockReason.PAIRINGS,
      `Sacar a este competidor cambiaría los cruces del resto: en ${laneLabel} solo puede salir el último inscripto, y solo cuando el fixture queda igual sin él.`
    )
  }

  return REMOVABLE
}

/**
 * Whether a competitor can be taken out of `category` without leaving a trace in
 * what is being played. Refusing is the normal case for most formats, not an
 * error — see the module docblock.
 *
 * `matches` and `competitors` may be those of the whole tournament; only the
 * ones belonging to `category` are read.
 */
export function canRemoveCompetitor(
  tournament: LateRegistrationTournament,
  category: LateRegistrationCategory,
  matches: LateRegistrationMatch[],
  competitors: LateRegistrationCompetitor[],
  competitorId: number
): RemovalCheck {
  // Nothing has been played and no structure exists yet: during the
  // registration phase the organizer moves and unregisters at will.
  if (tournament.status !== TournamentStatus.ONGOING) {
    return REMOVABLE
  }

  const categoryMatches = matches.filter((match) => match.tournamentCategoryId === category.id)

  // A category that materialised NOTHING never got going — a tournament skips
  // the categories left with a single competitor (see `materializeRound`). There
  // is no fixture to preserve, so there is nothing a departure could disturb.
  if (categoryMatches.length === 0) {
    return REMOVABLE
  }

  const own = categoryMatches.filter(
    (match) => match.homeCompetitorId === competitorId || match.awayCompetitorId === competitorId
  )

  if (own.some((match) => match.status === MatchStatus.WALKOVER && match.awayCompetitorId == null)) {
    return refuse(
      RemovalBlockReason.BYE,
      'El competidor tiene un bye y ya pasó de ronda: sacarlo dejaría el cruce que alimenta sin rival posible.'
    )
  }

  // A VOID fixture never happened (it was dropped when its rival completed their
  // quota, see `syncUnorderedVoids`), so it is not a result and does not count.
  if (own.some((match) => match.status !== MatchStatus.PENDING && match.status !== MatchStatus.VOID)) {
    return refuse(
      RemovalBlockReason.PLAYED,
      'El competidor ya tiene un partido con resultado cargado: sacarlo borraría lo que ya se jugó.'
    )
  }

  const closed = CLOSED_FORMATS[tournament.type]

  if (closed) {
    return refuse(RemovalBlockReason.FORMAT, closed)
  }

  const categoryCompetitors = competitors.filter((competitor) => competitor.tournamentCategoryId === category.id)
  const unordered = allowsUnorderedResults(tournament.type, tournament.settings)

  if (tournament.type === TournamentType.LEAGUE) {
    return canLeaveRoundRobinLane(
      laneOf(categoryMatches, MatchType.LEAGUE),
      sortCompetitorIds(categoryCompetitors, tournament.type),
      competitorId,
      unordered,
      'la liga'
    )
  }

  if (!isInGroupPhase(categoryMatches)) {
    return refuse(
      RemovalBlockReason.PHASE,
      'La fase de grupos de esta categoría ya terminó y el playoff se armó con esas posiciones: sacar a un competidor cambiaría el cuadro.'
    )
  }

  // The membership has to be the one actually being played, or a departure would
  // be evaluated against groups nobody is playing (see `resolveGroupMembership`).
  const groups = resolveGroupMembership(categoryCompetitors, categoryMatches, tournament.settings, unordered)
  const groupNumber = groups?.findIndex((group) => group.includes(competitorId)) ?? -1

  if (!groups || groupNumber < 0) {
    return refuse(
      RemovalBlockReason.MEMBERSHIP,
      'No se pudo determinar con certeza el grupo que se está jugando, así que no se puede garantizar que sacar al competidor no lo altere.'
    )
  }

  const laneCheck = canLeaveRoundRobinLane(
    laneOf(categoryMatches, MatchType.LEAGUE, groupNumber),
    groups[groupNumber],
    competitorId,
    unordered,
    `el grupo ${groupNumber + 1}`
  )

  if (!laneCheck.removable) {
    return laneCheck
  }

  // How many competitors each group sends to the knockout must not MOVE because
  // of the departure — but a group with one competitor fewer having one
  // qualifier fewer is not a move, it is the same cut-off applied to a smaller
  // field. That distinction matters: `minPlayoffQualifiers` re-levels the
  // cut-off ACROSS EVERY GROUP until the total is reached, so a shrinking group
  // can push the level up and make a DIFFERENT group send more competitors than
  // it is sending today. THAT is a change to the phase that follows, and it is
  // what this refuses.
  //
  // So the departure is measured against what the same cut-off would give: every
  // other group keeps its quota exactly, and the leaver's own keeps its quota
  // capped by the size it is left with — the only case where it legitimately
  // drops by one is a group that was sending everybody.
  const sizes = groups.map((group) => group.length)
  const sizesAfter = sizes.map((size, index) => (index === groupNumber ? size - 1 : size))
  const qualifiersPerGroup =
    tournament.settings?.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
  const minimum = tournament.settings?.minPlayoffQualifiers
  const before = resolveGroupQualifiers(sizes, qualifiersPerGroup, minimum)
  const after = resolveGroupQualifiers(sizesAfter, qualifiersPerGroup, minimum)
  const expected = before.map((quota, index) => (index === groupNumber ? Math.min(quota, sizesAfter[index]) : quota))

  if (after.some((quota, index) => quota !== expected[index])) {
    return refuse(
      RemovalBlockReason.QUALIFIERS,
      'Sacar a este competidor movería el corte de clasificación al playoff (cuántos pasa cada grupo), y eso cambia el cuadro que viene después.'
    )
  }

  return REMOVABLE
}
