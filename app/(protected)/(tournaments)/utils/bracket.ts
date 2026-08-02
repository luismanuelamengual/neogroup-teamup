import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType, MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'

/** Stage label for a round, counting Final/Semifinal/4tos/8vos from the end. */
export function roundLabel(roundIndex: number, totalRounds: number, matchCount: number): string {
  const fromEnd = totalRounds - 1 - roundIndex

  if (fromEnd === 0 && matchCount <= 1) {
    return 'Final'
  }

  if (fromEnd === 1) {
    return 'Semifinal'
  }

  if (fromEnd === 2) {
    return 'Cuartos de final'
  }

  if (fromEnd === 3) {
    return 'Octavos de final'
  }

  return `Ronda ${roundIndex + 1}`
}

/**
 * Minimal match shape needed to describe an undecided bracket slot. Both the
 * `Match` entity and `MatchDto` satisfy it.
 */
export interface BracketSlotMatch {
  roundNumber: number
  type: MatchType
  groupNumber: number | null
  position: number
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  status: MatchStatus
}

/** Human description of the two sides of a match whose slots aren't filled yet. */
export interface SlotLabels {
  home: string | null
  away: string | null
}

const NO_LABELS: SlotLabels = { home: null, away: null }

/** Matches of a single lane (type + group index), the unit a bracket lives in. */
function laneMatchesOf<T extends BracketSlotMatch>(all: T[], type: MatchType, groupNumber: number | null): T[] {
  return all.filter((match) => match.type === type && (match.groupNumber ?? null) === (groupNumber ?? null))
}

/** Ascending round numbers present in a lane. */
function laneRoundNumbers(lane: BracketSlotMatch[]): number[] {
  return [...new Set(lane.map((match) => match.roundNumber))].sort((a, b) => a - b)
}

/** Where the two sides of a still-undefined bracket match come from. */
interface FeederContext<T extends BracketSlotMatch> {
  /** Lane the feeder matches belong to. */
  lane: T[]
  /** Round of that lane holding the feeders. */
  roundNumber: number
  /** Whether the slot receives the feeder's winner or its loser. */
  outcome: 'winner' | 'loser'
}

/**
 * Resolves which matches feed a bracket match's two slots, mirroring the exact
 * conventions the server builds brackets with (see `syncKnockoutNextRound` and
 * `resolveFirstLossSlot` in utils/tournaments):
 *
 *  - Any knockout round past the first of its lane is fed by the previous round
 *    OF THAT LANE. Rounds are resolved by their index inside the lane rather
 *    than by `roundNumber - 1`, because a groups+playoff bracket starts at
 *    `groupPhaseRounds + 1` and the consolation lane starts at round 2.
 *  - The consolation bracket's first round is fed by the MAIN bracket's first
 *    round, and takes its losers.
 *  - The main bracket's first round is seeded, not fed: nothing to describe.
 */
function feederContext<T extends BracketSlotMatch>(match: T, categoryMatches: T[]): FeederContext<T> | null {
  const lane = laneMatchesOf(categoryMatches, match.type, match.groupNumber)
  const rounds = laneRoundNumbers(lane)
  const index = rounds.indexOf(match.roundNumber)

  if (index < 0) {
    return null
  }

  if (index > 0) {
    return { lane, roundNumber: rounds[index - 1]!, outcome: 'winner' }
  }

  if (match.type === MatchType.CONSOLATION_BRACKET) {
    const mainLane = laneMatchesOf(categoryMatches, MatchType.BRACKET, null)
    const mainRounds = laneRoundNumbers(mainLane)

    if (mainRounds.length === 0) {
      return null
    }

    return { lane: mainLane, roundNumber: mainRounds[0]!, outcome: 'loser' }
  }

  return null
}

/** Stage name of the round a feeder sits in ("Cuartos de final", …). */
function stageLabel(feeder: BracketSlotMatch, lane: BracketSlotMatch[]): string | null {
  const rounds = laneRoundNumbers(lane)
  const index = rounds.indexOf(feeder.roundNumber)

  if (index < 0) {
    return null
  }

  const matchCount = lane.filter((match) => match.roundNumber === feeder.roundNumber).length

  return roundLabel(index, rounds.length, matchCount)
}

/**
 * Describes a single slot from the match that feeds it. Deliberately only one
 * level deep: when the feeder itself has no names yet, chaining would produce
 * "Ganador de Ganador de A vs B vs Ganador de C vs D", so it falls back to the
 * feeder's stage instead ("Ganador de Cuartos de final #3").
 */
function describeFeeder(
  feeder: BracketSlotMatch | undefined,
  outcome: 'winner' | 'loser',
  lane: BracketSlotMatch[],
  nameOf: (competitorIds: number[]) => string
): string | null {
  if (!feeder) {
    return null
  }

  const verb = outcome === 'winner' ? 'Ganador' : 'Perdedor'
  const away = feeder.awayCompetitorIds

  if (feeder.homeCompetitorIds.length > 0 && away != null && away.length > 0) {
    return `${verb} de ${nameOf(feeder.homeCompetitorIds)} vs ${nameOf(away)}`
  }

  // A first-round bye has no rival, so it never produces a loser of its own:
  // its occupant only drops into the consolation bracket if they lose their
  // first REAL match, one round later. Naming them is both shorter and more
  // accurate than pointing at that later match, whose other side would end up
  // voiding this slot instead of filling it.
  if (outcome === 'loser' && feeder.status === MatchStatus.WALKOVER && feeder.homeCompetitorIds.length > 0) {
    return `${nameOf(feeder.homeCompetitorIds)} si pierde`
  }

  const stage = stageLabel(feeder, lane)

  return stage === null ? null : `${verb} de ${stage} #${feeder.position + 1}`
}

/**
 * Describes the sides of a knockout match that are still undefined, so a future
 * bracket slot can read "Ganador de Amengual vs Gutierrez" instead of a dash.
 *
 * Returns a label only for the sides that are actually empty — a half-resolved
 * match (one side known, the other still pending) keeps its real competitor on
 * one side and gets a description on the other. Every other case (leagues,
 * voided fixtures, fully-defined matchups, the seeded first round of a main
 * bracket) yields nothing, and the caller keeps whatever it showed before.
 */
export function resolveSlotLabels<T extends BracketSlotMatch>(
  match: T,
  categoryMatches: T[],
  nameOf: (competitorIds: number[]) => string
): SlotLabels {
  if (!isKnockoutType(match.type) || match.status === MatchStatus.VOID) {
    return NO_LABELS
  }

  const needsHome = match.homeCompetitorIds.length === 0
  const needsAway = match.awayCompetitorIds == null || match.awayCompetitorIds.length === 0

  if (!needsHome && !needsAway) {
    return NO_LABELS
  }

  const context = feederContext(match, categoryMatches)

  if (!context) {
    return NO_LABELS
  }

  const { lane, roundNumber, outcome } = context
  const feederAt = (position: number) =>
    lane.find((candidate) => candidate.roundNumber === roundNumber && candidate.position === position)

  // The feeder at 2p fills the home side of the match at p, and 2p+1 its away
  // side — the parity the whole bracket propagation is built on.
  return {
    home: needsHome ? describeFeeder(feederAt(match.position * 2), outcome, lane, nameOf) : null,
    away: needsAway ? describeFeeder(feederAt(match.position * 2 + 1), outcome, lane, nameOf) : null
  }
}
