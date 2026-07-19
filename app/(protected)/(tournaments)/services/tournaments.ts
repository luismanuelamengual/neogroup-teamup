import { DB } from '@neogroup/neorm'
import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import {
  createRound,
  deactivateTournamentRounds,
  isTournamentComplete
} from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import {
  autoAssignPreclassification,
  supportsPreclassification
} from '@/app/(protected)/(tournaments)/utils/preclassification'
import { ApiException } from '@/app/models/ApiException'
import { Organization } from '@/app/models/Organization'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Competitor } from '../models/Competitor'
import { TournamentCategory } from '../models/TournamentCategory'

export interface TournamentOptions {
  id?: number
  name?: string
  ownerId?: number
  playerId?: number
  statuses?: TournamentStatus[]
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  page?: number
  pageSize?: number
}

export async function getTournaments({
  id,
  ownerId,
  playerId,
  name,
  statuses,
  withCompetitors = false,
  withRounds = false,
  withMatches = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  const result = await Tournament.when(id, (query) => query.where('id', id))
    .with('categories', 'categories.category')
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) =>
      query.whereHas('competitors', (q) => q.whereArrayContains('playerIds', playerId))
    )
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    .when(withCompetitors, (query) =>
      query
        .with({ competitors: (query) => query.orderBy('seedNumber').orderBy('id') })
        .with('competitors.players')
    )
    .when(withRounds, (query) => query.with({ rounds: (query) => query.orderBy('number') }))
    .when(withMatches, (query) => query.with({ matches: (query) => query.orderBy('roundId').orderBy('position') }))
    .orderBy('status')
    .orderByDesc('id')
    .paginate(pageSize, page)

  return result
}

export async function getTournament(options: TournamentOptions = {}): Promise<Tournament | null> {
  const {
    data: [tournament = null]
  } = await getTournaments({ ...options, pageSize: 1 })

  return tournament
}

/**
 * Starts a tournament: removes empty category instances, auto-assigns
 * preclassification seeds from ranking (for bracket-style tournaments),
 * generates round 1, and marks the tournament as ongoing.
 */
export async function startTournament(tournament: Tournament): Promise<void> {
  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  // Everything that mutates the database is wrapped in a single transaction so the
  // whole start operation is atomic: if anything fails (or the serverless
  // function is killed mid-way, e.g. the Vercel cron 10s timeout), nothing is
  // committed and the tournament is left untouched in STAND_BY instead of in a
  // half-initialised state.
  await DB.transaction(async () => {
    // Remove real category instances that have no registered competitors.
    // The single category (categoryId = null) is always kept.
    const categories = await TournamentCategory.where('tournamentId', tournament.id).get()
    const realCategories = categories.filter((category) => category.categoryId != null)
    const allCompetitors = await Competitor.whereIn(
      'tournamentCategoryId',
      categories.map((category) => category.id)
    ).get()

    if (realCategories.length > 0) {
      const usedCategoryIds = new Set(allCompetitors.map((c) => c.tournamentCategoryId))

      for (const category of realCategories) {
        if (!usedCategoryIds.has(category.id)) {
          await category.delete()
        }
      }
    }

    // Auto-assign preclassification seeds from ranking when the tournament type
    // supports it (Playoff, Groups+Playoff, Playoff with consolation).
    if (supportsPreclassification(tournament.type)) {
      await autoAssignPreclassification(allCompetitors, tournament.organizationId)
    }

    tournament.status = TournamentStatus.ONGOING
    await createRound(tournament, 1)
    await tournament.save()
  })
}

/**
 * Finalises a tournament: marks it as finished, deactivates every (grace-window)
 * round and awards ranking points. Analogous to startTournament but for the
 * ONGOING → FINISHED transition.
 *
 * The whole operation runs in a single transaction so it is atomic: status
 * change, round deactivation and ranking awards are committed together or not at
 * all. This matters because finalisation can be triggered by the processTournaments
 * cron, whose 10s timeout on Vercel's Hobby plan could otherwise interrupt it and
 * leave the tournament FINISHED with only some of its ranking points awarded. If
 * the transaction is rolled back the tournament stays ONGOING, so the next cron
 * run simply retries it cleanly.
 */
export async function finishTournament(tournament: Tournament): Promise<void> {
  if (tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  await DB.transaction(async () => {
    tournament.status = TournamentStatus.FINISHED
    tournament.updatedAt = new Date()
    await tournament.save()
    await deactivateTournamentRounds(tournament)
    await awardRankingPoints(tournament.id)
  })
}

export async function deleteTournament(tournament: Tournament): Promise<boolean> {
  await tournament.delete()

  return true
}

export interface ProcessTournamentsResult {
  started: number[]
  startErrors: { id: number; error: string }[]
  finished: number[]
  finishedErrors: { id: number; error: string }[]
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
async function loadOrganizationTimezones(): Promise<Map<number, string>> {
  const organizations = await Organization.get()

  return new Map(organizations.map((organization) => [organization.id, organization.timezone || 'UTC']))
}

/**
 * Processes all tournaments across every organization:
 *  1. Starts every STAND_BY tournament whose scheduled start (startDate, and
 *     startTime when set) is now or in the past.
 *  2. Finishes every ONGOING tournament that has all rounds and matches completed.
 *
 * Intended to be called by the Vercel Cron Job endpoint. `now` is injectable for
 * testing; it defaults to the current instant.
 */
export async function processTournaments(now: Date = new Date()): Promise<ProcessTournamentsResult> {
  const result: ProcessTournamentsResult = {
    started: [],
    startErrors: [],
    finished: [],
    finishedErrors: []
  }
  // Prefilter by date with a one-day margin (in UTC) so no organization timezone
  // can hide a tournament that is actually due at a date boundary; the precise
  // decision — including startTime and the org timezone — is made per tournament
  // by isTournamentStartDue.
  const cutoffStr = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  // ── 1. Start due STAND_BY tournaments ─────────────────────────────────────
  const standByTournaments = await Tournament.withoutGlobalScopes()
    .where('status', TournamentStatus.STAND_BY)
    .where('startDate', '<=', cutoffStr)
    .get()
  const timezonesByOrg = await loadOrganizationTimezones()

  for (const tournament of standByTournaments) {
    const timeZone = timezonesByOrg.get(tournament.organizationId) ?? 'UTC'

    if (!isTournamentStartDue(tournament, timeZone, now)) {
      continue
    }

    try {
      await startTournament(tournament)
      result.started.push(tournament.id)
      // eslint-disable-next-line no-console
      console.log(`[processTournaments] Started tournament ${tournament.id} (${tournament.name})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      result.startErrors.push({ id: tournament.id, error: message })
      // eslint-disable-next-line no-console
      console.error(`[processTournaments] Failed to start tournament ${tournament.id}:`, message)
    }
  }

  // ── 2. Finish completed ONGOING tournaments ──────────────────────────────
  const ongoingTournaments = await Tournament.withoutGlobalScopes().where('status', TournamentStatus.ONGOING).get()

  for (const tournament of ongoingTournaments) {
    try {
      if (await isTournamentComplete(tournament)) {
        await finishTournament(tournament)
        result.finished.push(tournament.id)
        // eslint-disable-next-line no-console
        console.log(`[processTournaments] Finished tournament ${tournament.id} (${tournament.name})`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      result.finishedErrors.push({ id: tournament.id, error: message })
      // eslint-disable-next-line no-console
      console.error(`[processTournaments] Failed to finish tournament ${tournament.id}:`, message)
    }
  }

  return result
}
