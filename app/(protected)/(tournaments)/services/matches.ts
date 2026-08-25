import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScheduleInput } from '@/app/(protected)/(tournaments)/models/MatchScheduleInput'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { resolveSiteId } from '@/app/(protected)/(tournaments)/services/tournaments'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { getScoreWinner, isValidScore, normalizeScore } from '@/app/(protected)/(tournaments)/utils/score'
import { progressTournamentAfterResult } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'

export interface MatchOptions {
  id?: number
  tournamentId?: number
  tournamentCategoryId?: number
  tournamentCategoryIds?: number[]
  /** Matches where the home OR the away competitor is one of these ids. */
  competitorIds?: number[]
  statuses?: MatchStatus[]
  tournamentStatuses?: TournamentStatus[]
  /** Inclusive lower bound on `date` ('YYYY-MM-DD'). A match with no date set never matches this. */
  dateFrom?: string
  /** Inclusive upper bound on `date` ('YYYY-MM-DD'). A match with no date set never matches this. */
  dateTo?: string
  /** Eager-loads `tournamentCategory.tournament` (with its own venue) and `tournamentCategory.category`. */
  withTournament?: boolean
  /** Eager-loads the match's own venue override (`site`). */
  withSite?: boolean
}

/**
 * Unified match listing, analogous to `getTournaments`. Ordered soonest
 * scheduled first (unscheduled matches — no date/hour — sort first on most
 * databases, since NULL is treated as the lowest value).
 *
 * Unlike `Tournament` (and `Category`/`Site`), `Match` carries no organization
 * global scope of its own: it is only reachable through
 * tournament_categories → tournaments. Every filter below is safe to use on
 * its own once it is itself organization-scoped (an id, a set of
 * tournamentCategoryIds/competitorIds already resolved from the caller's own
 * organization, ...), but a bare `getMatches()` is NOT organization-scoped —
 * callers that don't already have such a filter must check the loaded
 * matches' tournament afterwards, the way `loadMatchForScheduling` below does
 * for a single match.
 */
export async function getMatches({
  id,
  tournamentId,
  tournamentCategoryId,
  tournamentCategoryIds,
  competitorIds,
  statuses,
  tournamentStatuses,
  dateFrom,
  dateTo,
  withTournament = false,
  withSite = false
}: MatchOptions = {}): Promise<Match[]> {
  return Match.when(id, (query) => query.where('id', id))
    .when(tournamentCategoryId, (query) => query.where('tournamentCategoryId', tournamentCategoryId))
    .when(tournamentCategoryIds?.length, (query) => query.whereIn('tournamentCategoryId', tournamentCategoryIds!))
    .when(competitorIds?.length, (query) =>
      query.where((group) =>
        group.whereIn('homeCompetitorId', competitorIds!).orWhereIn('awayCompetitorId', competitorIds!)
      )
    )
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    .when(dateFrom, (query) => query.where('date', '>=', dateFrom!))
    .when(dateTo, (query) => query.where('date', '<=', dateTo!))
    .when(tournamentId, (query) => query.whereHas('tournamentCategory', (q) => q.where('tournamentId', tournamentId)))
    .when(tournamentStatuses?.length, (query) =>
      query.whereHas('tournamentCategory', (q) =>
        q.whereHas('tournament', (q2) => q2.whereIn('status', tournamentStatuses!))
      )
    )
    .when(withTournament, (query) => query.with('tournamentCategory.tournament.site', 'tournamentCategory.category'))
    .when(withSite, (query) => query.with('site'))
    .orderBy('date')
    .orderBy('hour')
    .get()
}

/**
 * Saves (or edits) a match result on behalf of `userId` and drives the tournament
 * forward. Always allowed for any organizer of the tournament's organization
 * (not just its owner/creator) — mirrors the "any organizer can administer any
 * tournament" rule used across the rest of the app. Players taking part in the
 * match may also submit the result, but only when the tournament has
 * `allowPlayerSetScore` enabled. The match must also be editable. Throws an
 * ApiException when the match is not in an editable state, the caller is not
 * allowed to submit the result, or the score is invalid.
 */
export async function setMatchResult(matchId: number, score: MatchScore, userId: number): Promise<void> {
  const match = await Match.where('id', matchId).with('tournamentCategory.tournament').first()

  if (!match || match.awayCompetitorId == null) {
    throw new ApiException('notFound')
  }

  const tournament = match.tournamentCategory?.tournament ?? null

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  // A match is editable while its result has not been consumed downstream: the
  // current frontier of its lane, plus any just-completed round still inside its
  // (derived) grace window. This replaces the former rounds.active flag.
  const categoryMatches = await Match.where('tournamentCategoryId', match.tournamentCategoryId).get()

  if (!isMatchEditable(match, categoryMatches, tournament.type, tournament.status, tournament.settings)) {
    throw new ApiException('roundClosed')
  }

  // Any organizer of the organization may set a result for any of its
  // tournaments — not just the specific tournament's owner/creator.
  const caller = await User.where('id', userId).first()
  const isOrganizer = caller?.roleId === Role.ORGANIZER
  const participants = await Competitor.whereIn(
    'id',
    [match.homeCompetitorId, match.awayCompetitorId].filter((id): id is number => id != null)
  ).get()

  if (!isOrganizer) {
    // Players may only submit their own match result when the tournament opts
    // into it via `allowPlayerSetScore`; otherwise only an organizer can.
    const isParticipant =
      tournament.allowPlayerSetScore && participants.some((competitor) => competitor.playerIds.includes(userId))

    if (!isParticipant) {
      throw new ApiException('unauthorized')
    }
  }

  // Interclubes results are series of three individual matches, and each of
  // those names the players who took the court — so validation needs the two
  // rosters to check nobody plays for the wrong team (or twice in the series).
  const homeRoster = participants.find((competitor) => match.homeCompetitorId === competitor.id)
  const awayRoster = participants.find((competitor) => match.awayCompetitorId === competitor.id)

  if (
    !isValidScore(score, tournament.scoreFormat, {
      type: tournament.type,
      homePlayerIds: homeRoster?.playerIds,
      awayPlayerIds: awayRoster?.playerIds
    })
  ) {
    throw new ApiException('invalidScore')
  }

  // Whether this match already held a result (a correction) vs a first-time entry.
  const wasAlreadyResolved = match.status !== MatchStatus.PENDING

  if (score.walkover) {
    match.score = { walkover: score.walkover }
    match.status = MatchStatus.WALKOVER
    match.winner = score.walkover
  } else {
    match.score = normalizeScore(score)
    match.status = MatchStatus.PLAYED
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()

  // Automatically drive the tournament forward: update pairings/standings and
  // create the next round without any organizer action.
  await progressTournamentAfterResult(tournament, match, wasAlreadyResolved)
}

/**
 * Loads a match for a scheduling operation, enforcing that the caller may
 * perform it. Scheduling is an organizer-only action: unlike setMatchResult,
 * there is no opt-in that lets a player move their own match around. The match
 * must also belong to a tournament of the caller's own organization, so a
 * crafted id from another club is rejected rather than silently scheduled.
 */
async function loadMatchForScheduling(matchId: number, userId: number, organizationId: number): Promise<Match> {
  const match = await Match.where('id', matchId).with('tournamentCategory.tournament').first()
  const tournament = match?.tournamentCategory?.tournament ?? null

  if (!match || !tournament || tournament.organizationId !== organizationId) {
    throw new ApiException('notFound', 404)
  }

  const caller = await User.where('id', userId).first()

  if (caller?.roleId !== Role.ORGANIZER) {
    throw new ApiException('unauthorized', 403)
  }

  return match
}

/** True for a 'YYYY-MM-DD' string that also denotes a real calendar day. */
function isValidScheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  // Rejects well-formed but non-existent days such as '2026-02-31', which the
  // Date constructor would silently roll over into the next month.
  const parsed = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Schedules a match: the venue, day, start time and court it is (or was) played
 * at. Organizer-only, and the only writer of these fields — the planner is
 * currently the single place they are loaded from.
 *
 * `date` and `hour` are stored verbatim as 'YYYY-MM-DD' / 'HH:mm' strings: they
 * are wall-clock values at the venue, not instants, so they must not be pulled
 * through a timezone conversion on the way in or out (see migration 013).
 *
 * Unlike setMatchResult this never touches the match status/score and never
 * drives the tournament forward — a scheduled match is still pending until a
 * result is loaded, and a played match can still be corrected afterwards
 * (e.g. recording the court a finished match was actually played on).
 */
export async function setMatchSchedule(
  matchId: number,
  schedule: MatchScheduleInput,
  userId: number,
  organizationId: number
): Promise<void> {
  const match = await loadMatchForScheduling(matchId, userId, organizationId)

  if (!isValidScheduleDate(schedule.date)) {
    throw new ApiException('invalidDate')
  }

  if (typeof schedule.hour !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.hour)) {
    throw new ApiException('invalidHour')
  }

  const courtNumber = Number(schedule.courtNumber)

  if (!Number.isInteger(courtNumber) || courtNumber < 1) {
    throw new ApiException('invalidCourtNumber')
  }

  // A match is always planned somewhere, so unlike the tournament's own site
  // this one cannot be left empty. resolveSiteId additionally rejects an id
  // that is not part of this organization's catalogue.
  const siteId = await resolveSiteId(organizationId, schedule.siteId)

  if (siteId === null) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  match.siteId = siteId
  match.date = schedule.date
  match.hour = schedule.hour
  match.courtNumber = courtNumber
  match.updatedAt = new Date()
  await match.save()
}

/**
 * Removes a match from the planning, leaving all four scheduling fields empty
 * (its state before it was ever planned). Organizer-only, same as
 * setMatchSchedule.
 */
export async function clearMatchSchedule(matchId: number, userId: number, organizationId: number): Promise<void> {
  const match = await loadMatchForScheduling(matchId, userId, organizationId)

  match.siteId = null
  match.date = null
  match.hour = null
  match.courtNumber = null
  match.updatedAt = new Date()
  await match.save()
}
