import { DB } from '@neogroup/neorm'
import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { CreateTournamentInput } from '@/app/(protected)/(tournaments)/models/CreateTournamentInput'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { DEFAULT_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentImage } from '@/app/(protected)/(tournaments)/models/TournamentImage'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { resolveCategoryIds } from '@/app/(protected)/(tournaments)/services/categories'
import { autoAssignPreclassification } from '@/app/(protected)/(tournaments)/services/preclassification'
import { supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
import { getScoreWinner, isValidScore, serializeScore } from '@/app/(protected)/(tournaments)/utils/score'
import {
  createRound,
  createTournamentCategories,
  deactivateTournamentRounds,
  isTournamentComplete,
  isTournamentStartDue,
  loadOrganizationTimezones,
  normalizeCategories,
  normalizeImage,
  normalizeStartTime,
  progressTournamentAfterResult
} from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface TournamentOptions {
  id?: number
  name?: string
  ownerId?: number
  playerId?: number
  statuses?: TournamentStatus[]
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  withImage?: boolean
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
  withImage = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  const result = await Tournament.when(id, (query) => query.where('id', id))
    .with('categories', 'categories.category')
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) => query.whereHas('competitors', (q) => q.whereArrayContains('playerIds', playerId)))
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    .when(withCompetitors, (query) =>
      query.with({ competitors: (query) => query.orderBy('seedNumber').orderBy('id') }).with('competitors.players')
    )
    .when(withRounds, (query) => query.with({ rounds: (query) => query.orderBy('number') }))
    .when(withMatches, (query) => query.with({ matches: (query) => query.orderBy('roundId').orderBy('position') }))
    .when(withImage, (query) => query.with('image'))
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
 * Creates a new tournament (in STAND_BY status) owned by `userId` inside
 * `organizationId`, from the organizer-provided input. Validates the input,
 * resolves/creates its categories, materialises the category instances and
 * stores the optional poster image. Returns the new tournament id.
 */
export async function createTournament(
  input: CreateTournamentInput,
  userId: number,
  organizationId: number
): Promise<{ id: number }> {
  const name = input.name?.trim() ?? ''

  if (!name || !input.discipline || !input.type || !input.scoreFormat) {
    throw new ApiException('missingFields')
  }

  if (!input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  if (input.paid && (!input.entryFee || input.entryFee <= 0)) {
    throw new ApiException('El monto de inscripción debe ser mayor a cero')
  }

  if (input.discipline === Discipline.TENNIS && !input.subDiscipline) {
    throw new ApiException('missingFields')
  }

  if (
    (input.type === TournamentType.AMERICANO || input.type === TournamentType.AMERICANO_WITH_SWAP) &&
    input.discipline !== Discipline.PADEL
  ) {
    throw new ApiException('americanoOnlyPadel')
  }

  const startTime = normalizeStartTime(input.startTime)

  if (startTime === false) {
    throw new ApiException('invalidTime')
  }

  const image = normalizeImage(input.image)

  if (image === false) {
    throw new ApiException('invalidImage')
  }

  const categoryNames = normalizeCategories(input.categoryNames)
  const subDiscipline = input.discipline === Discipline.TENNIS ? (input.subDiscipline ?? null) : null
  const categoryIds = categoryNames
    ? await resolveCategoryIds(organizationId, input.discipline, subDiscipline, categoryNames)
    : null
  let settings: TournamentSettings = {}

  if (input.type === TournamentType.LEAGUE) {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.AMERICANO || input.type === TournamentType.AMERICANO_WITH_SWAP) {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.PLAYOFF || input.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    settings = { ...DEFAULT_PLAYOFF_SETTINGS }
  } else if (input.type === TournamentType.GROUPS_PLAYOFF) {
    const competitorsPerGroup = Math.floor(
      input.settings?.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
    )
    const qualifiersPerGroup = Math.floor(
      input.settings?.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
    )

    if (competitorsPerGroup < 2 || qualifiersPerGroup < 1 || qualifiersPerGroup >= competitorsPerGroup) {
      throw new ApiException('invalidGroupsSettings')
    }

    settings = { competitorsPerGroup, qualifiersPerGroup }
  }

  const tournament = new Tournament()

  tournament.organizationId = organizationId
  tournament.ownerId = userId
  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.status = TournamentStatus.STAND_BY
  tournament.discipline = input.discipline
  tournament.subDiscipline = subDiscipline
  tournament.type = input.type
  tournament.scoreFormat = input.scoreFormat
  tournament.startDate = input.startDate
  tournament.startTime = startTime
  tournament.location = input.location?.trim() || null
  tournament.paid = Boolean(input.paid)
  tournament.entryFee = input.paid && input.entryFee && input.entryFee > 0 ? input.entryFee : null
  tournament.currency = input.currency?.trim() || 'ARS'
  tournament.settings = settings
  // Ranking points only apply to tournaments that define categories.
  tournament.rankingSettings =
    categoryIds && categoryIds.length > 0 && input.rankingSettings?.points ? input.rankingSettings : null
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await tournament.save()

  // Materialise the category instances: one per resolved category, or a single
  // "single category" instance (categoryId = null) when there are none. The
  // per-tournament maxCompetitors becomes the entry limit of each instance.
  await createTournamentCategories(tournament.id, categoryIds, input.maxCompetitors!)
  await setTournamentImage(tournament.id, image)

  return { id: tournament.id }
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

/**
 * Creates, updates or removes a tournament's poster picture row.
 *
 * @param image The already-validated base64 data URL (see `normalizeImage`),
 *   or null to clear the tournament's picture.
 */
export async function setTournamentImage(tournamentId: number, image: string | null): Promise<void> {
  const existing = await TournamentImage.where('tournamentId', tournamentId).first()

  if (!image) {
    if (existing) {
      await existing.delete()
    }

    return
  }

  const now = new Date()

  if (existing) {
    existing.image = image
    existing.updatedAt = now
    await existing.save()

    return
  }

  const record = new TournamentImage()

  record.tournamentId = tournamentId
  record.image = image
  record.createdAt = now
  record.updatedAt = now
  await record.save()
}

export interface ProcessTournamentsResult {
  started: number[]
  startErrors: { id: number; error: string }[]
  finished: number[]
  finishedErrors: { id: number; error: string }[]
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

/**
 * Saves (or edits) a match result on behalf of `userId` and drives the tournament
 * forward. Allowed for the tournament owner and for players taking part in the
 * match, while the match round is open. Throws an ApiException when the match or
 * round is not in an editable state, the caller is not allowed to submit the
 * result, or the score is invalid.
 */
export async function setMatchResult(matchId: number, score: MatchScore, userId: number): Promise<void> {
  const match = await Match.where('id', matchId).with('tournamentCategory.tournament', 'round').first()

  if (!match || !match.awayCompetitorIds) {
    throw new ApiException('notFound')
  }

  const tournament = match.tournamentCategory?.tournament ?? null

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  const round = match.round ?? null

  // A round is editable while it is active: the current frontier, plus any
  // just-completed round still inside its grace window (closed but active).
  if (!round || !round.active) {
    throw new ApiException('roundClosed')
  }

  const isOwner = tournament.ownerId === userId

  if (!isOwner) {
    const competitorIds = [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]
    const participants = await Competitor.whereIn('id', competitorIds).get()
    const isParticipant = participants.some((competitor) => competitor.playerIds.includes(userId))

    if (!isParticipant) {
      throw new ApiException('unauthorized')
    }
  }

  if (!isValidScore(score, tournament.scoreFormat)) {
    throw new ApiException('invalidScore')
  }

  if (score.walkover) {
    match.score = serializeScore({ walkover: score.walkover }, tournament.scoreFormat)
    match.status = MatchStatus.WALKOVER
    match.winner = score.walkover
  } else {
    match.score = serializeScore(score, tournament.scoreFormat)
    match.status = MatchStatus.PLAYED
    match.winner = getScoreWinner(score, tournament.scoreFormat)
  }

  match.updatedAt = new Date()
  await match.save()

  // Automatically drive the tournament forward: update pairings/standings, close
  // the round and create the next one (or finish) without any organizer action.
  await progressTournamentAfterResult(tournament, round)
}
