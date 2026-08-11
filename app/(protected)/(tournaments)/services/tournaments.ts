import { DB } from '@neogroup/neorm'
import { hasOverdueDebt } from '@/app/(protected)/(payments)/services/payments'
import { awardRankingPoints } from '@/app/(protected)/(rankings)/services/rankings'
import { Site } from '@/app/(protected)/(sites)/models/Site'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { CreateTournamentInput } from '@/app/(protected)/(tournaments)/models/CreateTournamentInput'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScheduleInput } from '@/app/(protected)/(tournaments)/models/MatchScheduleInput'
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
  canDeleteTournament,
  closeCategoryGroupPhase,
  createRound,
  createTournamentCategories,
  deleteVoidedFixtures,
  freezeGroupMembership,
  isTournamentComplete,
  normalizeCategoryIds,
  normalizeImage,
  normalizeStartTime,
  progressTournamentAfterResult
} from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { Organization } from '@/app/models/Organization'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'

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
    .when(withMatches, (query) =>
      query
        .with({ matches: (query) => query.orderBy('roundNumber').orderBy('position') })
        // The venue is eager-loaded so a match card can name it without an extra
        // round-trip. Only matches scheduled somewhere other than the tournament's
        // own site carry one, so this resolves to null for most rows.
        .with('matches.site')
    )
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

  const startInscriptionsDate = input.startInscriptionsDate?.trim() || null

  if (startInscriptionsDate && startInscriptionsDate > input.startDate) {
    throw new ApiException('La fecha de inicio de inscripciones no puede ser posterior a la fecha de inicio del torneo')
  }

  const enabledDisciplines = await getEnabledDisciplines(organizationId)

  if (!enabledDisciplines.includes(input.discipline)) {
    throw new ApiException('La disciplina seleccionada no está habilitada para esta organización')
  }

  if (input.entryFee !== undefined && input.entryFee !== null && input.entryFee <= 0) {
    throw new ApiException('El monto de inscripción debe ser mayor a cero')
  }

  // A tournament cannot be created while the organization owes TeamUp for
  // tournaments that finished more than a month ago.
  if (await hasOverdueDebt(organizationId)) {
    throw new ApiException(
      'Tenés torneos con más de un mes sin abonar. Regularizá los pagos pendientes para poder crear nuevos torneos'
    )
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

  if (input.type === TournamentType.AMERICANO && input.discipline !== Discipline.PADEL) {
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
  const entryFee = input.entryFee && input.entryFee > 0 ? input.entryFee : null
  // A paid tournament (entryFee set) whose organization charges no service fee
  // (serviceFeePercentage === 0) owes TeamUp nothing, ever — so it is created
  // already settled instead of sitting as a false pending payment.
  let paid = false

  if (entryFee !== null) {
    const organization = await Organization.where('id', organizationId).first()

    if ((organization?.serviceFeePercentage ?? 0) === 0) {
      paid = true
    }
  }

  let settings: TournamentSettings = {}

  if (input.type === TournamentType.LEAGUE) {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }

    // Stored only when enabled, so an untouched league keeps the exact settings
    // payload it had before this setting existed.
    if (input.settings?.allowUnorderedResults) {
      settings.allowUnorderedResults = true
    } else {
      delete settings.allowUnorderedResults
    }
  } else if (input.type === TournamentType.AMERICANO) {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.PLAYOFF) {
    settings = { ...DEFAULT_PLAYOFF_SETTINGS }

    // Stored only when enabled, same convention as league's allowUnorderedResults.
    if (input.settings?.consolationBracket) {
      settings.consolationBracket = true
    }
  } else if (input.type === TournamentType.GROUPS_PLAYOFF) {
    const competitorsPerGroup = Math.floor(
      input.settings?.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
    )
    const qualifiersPerGroup = Math.floor(
      input.settings?.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
    )

    /** Optional positive integer setting; anything empty or ≤ 0 means "unset". */
    const optionalCount = (value: number | null | undefined): number | undefined => {
      if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) {
        return undefined
      }

      return Math.floor(Number(value))
    }

    // Floor on the total knockout field. Deliberately unbounded above: a huge
    // value is how an organizer says "everybody advances".
    const minPlayoffQualifiers = optionalCount(input.settings?.minPlayoffQualifiers)
    const maxRounds = optionalCount(input.settings?.maxRounds)

    if (competitorsPerGroup < 2 || qualifiersPerGroup < 1 || qualifiersPerGroup >= competitorsPerGroup) {
      throw new ApiException('invalidGroupsSettings')
    }

    settings = {
      competitorsPerGroup,
      qualifiersPerGroup,
      pointsPerPresent: input.settings?.pointsPerPresent ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.pointsPerPresent,
      pointsPerSetWon: input.settings?.pointsPerSetWon ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.pointsPerSetWon,
      pointsPerMatchWon: input.settings?.pointsPerMatchWon ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.pointsPerMatchWon
    }

    // Optional settings are omitted rather than stored as an explicit null.
    if (minPlayoffQualifiers != null) {
      settings.minPlayoffQualifiers = minPlayoffQualifiers
    }

    if (maxRounds != null) {
      settings.maxRounds = maxRounds
    }

    if (input.settings?.allowUnorderedResults) {
      settings.allowUnorderedResults = true
    }
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
  tournament.startInscriptionsDate = startInscriptionsDate
  tournament.siteId = siteId
  // `paid` is the settlement flag of TeamUp's service fee: a free tournament
  // never owes one, and neither does a paid one whose organization has no
  // service fee configured (see `paid` above). Otherwise a brand-new
  // tournament owes nothing yet.
  tournament.paid = paid
  tournament.paidAt = null
  tournament.servicePaymentId = null
  tournament.entryFee = entryFee
  tournament.currency = 'ARS'
  tournament.allowPlayerSetScore = Boolean(input.allowPlayerSetScore)
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
    // Before round 1 exists: the groups are computed once here and written onto
    // the competitors, so what gets played is fixed and a late entrant can no
    // longer reshuffle it (see freezeGroupMembership). No-op for every type that
    // does not play groups.
    await freezeGroupMembership(tournament)
    await createRound(tournament, 1)
    await tournament.save()
  })
}

/**
 * Finalises a tournament: marks it as finished, awards ranking points and
 * clears the fixtures an unordered round robin had voided. Analogous to
 * startTournament but for the ONGOING → FINISHED transition. Once finished the
 * tournament is no longer ONGOING, so every match becomes read-only (match
 * editability is derived and requires an ONGOING tournament).
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
    // After the awards, which read the tournament's matches back. Voided
    // fixtures never counted towards anything, so this changes no placement —
    // it only stops them from lingering as rows nobody will ever look at.
    await deleteVoidedFixtures(tournament)
  })
}

/**
 * Closes the group phase of ONE category of a running "groups + playoff"
 * tournament and starts its knockout, without waiting for the fixtures that are
 * still pending (they are voided — see `closeCategoryGroupPhase` for what that
 * means and why).
 *
 * Scoped to a single category on purpose: categories of the same tournament run
 * their own group phases at their own pace, and an organizer whose Cuarta is
 * stuck has no reason to cut the Primera short as well.
 *
 * Wrapped in a transaction, like start/finish: voiding the fixtures, flagging
 * the category and seeding the bracket are one indivisible step. A partial
 * commit would be the worst of both worlds — fixtures cancelled with no
 * knockout to show for it.
 *
 * Returns how many fixtures were voided, so the caller can tell the organizer.
 */
export async function closeGroupPhase(tournament: Tournament, tournamentCategoryId: number): Promise<number> {
  const category = await TournamentCategory.where('id', Number(tournamentCategoryId)).first()

  if (!category || category.tournamentId !== tournament.id) {
    throw new ApiException('notFound', 404)
  }

  return DB.transaction(async () => closeCategoryGroupPhase(tournament, category))
}

export async function deleteTournament(tournament: Tournament): Promise<boolean> {
  if (!canDeleteTournament(tournament)) {
    throw new ApiException(
      'No se puede eliminar un torneo de pago que ya inició o finalizó hasta que se abone su servicio'
    )
  }

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
 *  - Finishes every ONGOING tournament that has all rounds and matches completed.
 *
 * Starting a tournament is a manual, organizer-only action (`POST /api/startTournament`)
 * — this cron no longer auto-starts STAND_BY tournaments, regardless of their
 * scheduled startDate/startTime.
 *
 * Intended to be called by the Vercel Cron Job endpoint.
 */
export async function processTournaments(): Promise<ProcessTournamentsResult> {
  const result: ProcessTournamentsResult = {
    started: [],
    startErrors: [],
    finished: [],
    finishedErrors: []
  }
  // ── Finish completed ONGOING tournaments ──────────────────────────────
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
