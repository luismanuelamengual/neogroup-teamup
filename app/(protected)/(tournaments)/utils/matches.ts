import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType, MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Minimal match shape needed to decide editability. Both the `Match` entity and
 * `MatchDto` satisfy it, so the same rule runs on the server (setMatchResult)
 * and on the client (view highlighting).
 */
export interface EditableMatch {
  id: number
  roundNumber: number
  type: MatchType
  groupNumber: number | null
  position: number
  bracketInstance: number | null
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  status: MatchStatus
}

/** A real, fully-defined matchup (not a bye or a "to be defined" placeholder). */
export function isPlayableMatch(match: EditableMatch): boolean {
  return match.homeCompetitorIds.length > 0 && match.awayCompetitorIds != null && match.awayCompetitorIds.length > 0
}

/**
 * Whether a match currently accepts a result (either a first result or an edit
 * of an existing one). This is the derived replacement for the former
 * `rounds.active` flag and its grace-window bookkeeping — it is computed purely
 * from the matches of the same category.
 *
 * Rules, all scoped to the match's own lane (type + groupNumber):
 *  - Tournament must be ONGOING and the match a real matchup.
 *  - Knockout: editable while the winner has not been consumed downstream, i.e.
 *    the next match still has no result (the final — bracketInstance 1 — is
 *    editable for as long as the tournament is ongoing). The next match is the
 *    one in the same lane at bracketInstance − 1 and position floor(b / 2).
 *  - League / americano / group: editable while no later round of the SAME lane
 *    already holds a result (this is the grace window: a closed round stays
 *    editable until its successor receives a result).
 *  - Cross-lane: in a groups+playoff, a group result is locked once the knockout
 *    bracket holds any result, since editing it would change the seeding.
 */
export function isMatchEditable(
  match: EditableMatch,
  categoryMatches: EditableMatch[],
  tournamentType: TournamentType,
  tournamentStatus: TournamentStatus
): boolean {
  if (tournamentStatus !== TournamentStatus.ONGOING) {
    return false
  }

  if (!isPlayableMatch(match)) {
    return false
  }

  if (isKnockoutType(match.type)) {
    // The final (bracketInstance 1) has no successor: editable while ongoing.
    if (match.bracketInstance === 1) {
      return true
    }

    const next = categoryMatches.find(
      (candidate) =>
        candidate.type === match.type &&
        (candidate.groupNumber ?? null) === (match.groupNumber ?? null) &&
        candidate.bracketInstance === (match.bracketInstance ?? 0) - 1 &&
        candidate.position === Math.floor(match.position / 2)
    )

    return !next || next.status === MatchStatus.PENDING
  }

  const laneHasLaterResult = categoryMatches.some(
    (candidate) =>
      candidate.type === match.type &&
      (candidate.groupNumber ?? null) === (match.groupNumber ?? null) &&
      candidate.roundNumber > match.roundNumber &&
      candidate.status !== MatchStatus.PENDING
  )

  if (laneHasLaterResult) {
    return false
  }

  if (tournamentType === TournamentType.GROUPS_PLAYOFF && match.groupNumber != null) {
    const knockoutHasResult = categoryMatches.some(
      (candidate) => candidate.type === MatchType.BRACKET && candidate.status !== MatchStatus.PENDING
    )

    if (knockoutHasResult) {
      return false
    }
  }

  return true
}
