import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { isKnockoutType, MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { allowsUnorderedResults } from '@/app/(protected)/(tournaments)/utils/settings'

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
 * Whether a match carries an outcome that counts towards points, standings and
 * statistics. Three kinds of match do not:
 *  - PENDING: the result has not been loaded yet.
 *  - VOID: it will never be played, so it never happened. Careful — a voided
 *    fixture of an unordered round robin keeps BOTH its sides (unlike an empty
 *    consolation slot, which has no rival), so checking `awayCompetitorIds`
 *    alone is not enough to filter it out.
 *  - placeholders with no rival yet (`awayCompetitorIds` null/empty).
 */
export function countsForStandings<T extends { status: MatchStatus; awayCompetitorIds: number[] | null }>(
  match: T
): match is T & { awayCompetitorIds: number[] } {
  return match.status !== MatchStatus.PENDING && match.status !== MatchStatus.VOID && match.awayCompetitorIds != null
}

/** Minimal shape needed to decide whether a match displays a schedule. */
export interface SchedulableMatch {
  siteId: number | null
  date: string | null
  hour: string | null
}

/**
 * Whether a match card shows its schedule strip (day / time / venue). The venue
 * on its own only counts when it differs from `tournamentSiteId`: a match played
 * at the tournament's own site adds nothing worth displaying.
 *
 * Shared with BracketView, which lays its cards out on a fixed vertical grid and
 * therefore needs to know, before rendering, whether the taller card applies.
 */
export function hasMatchSchedule(match: SchedulableMatch, tournamentSiteId: number | null): boolean {
  return match.date != null || match.hour != null || (match.siteId != null && match.siteId !== tournamentSiteId)
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
 *    editable until its successor receives a result). This is exactly the rule
 *    that `allowUnorderedResults` lifts: with no active round every fixture of
 *    the lane stays editable for as long as the tournament runs.
 *  - Cross-lane: in a groups+playoff, a group result is locked once the knockout
 *    bracket holds any result, since editing it would change the seeding. This
 *    one holds regardless of `allowUnorderedResults`.
 *
 * `settings` is optional: omitting it evaluates the classic ordered rules,
 * which is what every tournament without the setting gets anyway.
 */
export function isMatchEditable(
  match: EditableMatch,
  categoryMatches: EditableMatch[],
  tournamentType: TournamentType,
  tournamentStatus: TournamentStatus,
  settings?: TournamentSettings | null
): boolean {
  if (tournamentStatus !== TournamentStatus.ONGOING) {
    return false
  }

  if (!isPlayableMatch(match)) {
    return false
  }

  // A voided fixture keeps both its sides, so isPlayableMatch lets it through:
  // it is a matchup that will never be played, and never accepts a result.
  if (match.status === MatchStatus.VOID) {
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

  // With unordered results there is no frontier round to protect: rounds are a
  // pure layout of a schedule that exists in full, so a later one holding a
  // result says nothing about this one.
  if (!allowsUnorderedResults(tournamentType, settings)) {
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
  }

  if (
    (tournamentType === TournamentType.GROUPS_PLAYOFF || tournamentType === TournamentType.INTERCLUBS) &&
    match.groupNumber != null
  ) {
    const knockoutHasResult = categoryMatches.some(
      (candidate) => candidate.type === MatchType.BRACKET && candidate.status !== MatchStatus.PENDING
    )

    if (knockoutHasResult) {
      return false
    }
  }

  return true
}
