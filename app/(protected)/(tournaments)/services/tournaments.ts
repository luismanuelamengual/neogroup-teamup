import { DB } from '@neogroup/neorm'
import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { Site } from '@/app/(protected)/(sites)/models/Site'
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
import { validateCategoryIds } from '@/app/(protected)/(tournaments)/services/categories'
import { getEnabledDisciplines } from '@/app/(protected)/(tournaments)/services/organizations'
import { autoAssignPreclassification } from '@/app/(protected)/(tournaments)/services/preclassification'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'
import { getScoreWinner, isValidScore, normalizeScore } from '@/app/(protected)/(tournaments)/utils/score'
import {
  createRound,
  createTournamentCategories,
  isTournamentComplete,
  isTournamentStartDue,
  loadOrganizationTimezones,
  normalizeCategoryIds,
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
  withMatches = false,
  withImage = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  const result = await Tournament.when(id, (query) => query.where('id', id))
    .with('categories', 'categories.category', 'site')
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) => query.whereHas('competitors', (q) => q.whereArrayContains('playerIds', playerId)))
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    .when(withCompetitors, (query) =>
      query.with({ competitors: (query) => query.orderBy('seedNumber').orderBy('id') }).with('competitors.players')
    )
    .when(withMatches, (query) => query.with({ matches: (query) => query.orderBy('roundNumber').orderBy('position') }))
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
 * Resolves the venue a tournament is played at.
 *
 * Sites belong to the catalogue the administrator maintains (/sites ABM), so an
 * id that is not one of the organization's sites is rejected rather than
 * silently stored. `null` / undefined means "no venue", which stays valid.
 */
export async function resolveSiteId(organizationId: number, siteId: unknown): Promise<number | null> {
  if (siteId === undefined || siteId === null || siteId === '') {
    return null
  }

  const id = Number(siteId)

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  const site = await Site.where('organizationId', organizationId).where('id', id).first()

  if (!site) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  return site.id
}

/**
 * Creates a new tournament (in STAND_BY status) owned by `userId` inside
 * `organizationId`, from the organizer-provided input. Validates the input and
 * the referenced catalogue rows (site, categories), materialises the category
 * instances and stores the optional poster image. Returns the new tournament id.
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

  const enabledDisciplines = await getEnabledDisciplines(organizationId)

  if (!enabledDisciplines.includes(input.discipline)) {
    throw new ApiException('La disciplina seleccionada no está habilitada para esta organización')
  }

  if (input.paid && (!input.entryFee || input.entryFee <= 0)) {
    throw new ApiException('El monto de inscripción debe ser mayor a cero')
  }

  // Interclubes is tennis-only, and its encounters mix singles and doubles, so
  // it is also the one tennis format that carries no modality.
  const isInterclubs = input.type === TournamentType.INTERCLUBS

  if (isInterclubs && input.discipline !== Discipline.TENNIS) {
    throw new ApiException('Los torneos de Interclubes solo están disponibles para tenis')
  }

  if (input.discipline === Discipline.TENNIS && !isInterclubs && !input.subDiscipline) {
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

  const subDiscipline = input.discipline === Discipline.TENNIS && !isInterclubs ? (input.subDiscipline ?? null) : null
  const pickedCategoryIds = normalizeCategoryIds(input.categoryIds)
  const categoryIds = pickedCategoryIds
    ? await validateCategoryIds(organizationId, input.discipline, pickedCategoryIds)
    : null
  const siteId = await resolveSiteId(organizationId, input.siteId)
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
  tournament.siteId = siteId
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
 * Finalises a tournament: marks it as finished and awards ranking points.
 * Analogous to startTournament but for the ONGOING → FINISHED transition. Once
 * finished the tournament is no longer ONGOING, so every match becomes read-only
 * (match editability is derived and requires an ONGOING tournament).
 *
 * The whole operation runs in a single transaction so it is atomic: status
 * change and ranking awards are committed together or not at
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
 * match, while the match is editable. Throws an ApiException when the match is
 * not in an editable state, the caller is not allowed to submit the result, or
 * the score is invalid.
 */
export async function setMatchResult(matchId: number, score: MatchScore, userId: number): Promise<void> {
  const match = await Match.where('id', matchId).with('tournamentCategory.tournament').first()

  if (!match || !match.awayCompetitorIds) {
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

  if (!isMatchEditable(match, categoryMatches, tournament.type, tournament.status)) {
    throw new ApiException('roundClosed')
  }

  const isOwner = tournament.ownerId === userId
  const participants = await Competitor.whereIn('id', [
    ...match.homeCompetitorIds,
    ...(match.awayCompetitorIds ?? [])
  ]).get()

  if (!isOwner) {
    const isParticipant = participants.some((competitor) => competitor.playerIds.includes(userId))

    if (!isParticipant) {
      throw new ApiException('unauthorized')
    }
  }

  // Interclubes results are series of three individual matches, and each of
  // those names the players who took the court — so validation needs the two
  // rosters to check nobody plays for the wrong team (or twice in the series).
  const homeRoster = participants.find((competitor) => match.homeCompetitorIds.includes(competitor.id))
  const awayRoster = participants.find((competitor) => (match.awayCompetitorIds ?? []).includes(competitor.id))

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
