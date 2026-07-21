/* eslint-disable no-console */
/**
 * Integration-test harness for the TeamUp tournament engine.
 *
 * Runs the REAL models, services and engine against a throwaway in-memory SQLite
 * database (configured via DB_DRIVER/DB_URL in the test loader / vitest setup).
 * It deliberately avoids the HTTP layer: every helper calls the same service
 * functions the API routes call, so the tests exercise the actual tournament
 * logic end to end.
 */
import { DB, SqliteDataSource } from '@neogroup/neorm'
import { Category } from '@/app/(protected)/(tournaments)/models/Category'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Round } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { finishTournament, startTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { getScoreWinner, isValidScore, serializeScore } from '@/app/(protected)/(tournaments)/utils/score'
import { isTournamentComplete, progressTournamentAfterResult } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { Organization } from '@/app/models/Organization'
import { User } from '@/app/models/User'
import migration from '@/database/migrations/001-create-base-tables'
import migration002 from '@/database/migrations/002-competitors-player-ids'

const TABLES = [
  'tournament_payments',
  'matches',
  'rounds',
  'competitors',
  'tournament_categories',
  'tournaments',
  'rankings',
  'player_statistics',
  'organization_statistics',
  'categories',
  'mercadopago_accounts',
  // These two hold a FK to users — must be dropped before it, or Postgres
  // refuses to drop users with "other objects depend on it".
  'password_reset_tokens',
  'email_verification_tokens',
  'users',
  'organizations',
  'migrations'
]

/**
 * Hard safety fuse: this function drops core tables (users, organizations,
 * tournaments, …) unconditionally. A misconfigured environment — e.g. a CI/
 * build machine that inherits the real DB_URL as a build-time env var — must
 * never be able to reach a non-throwaway database through this path, no matter
 * what the test setup files did or didn't do. This is deliberately redundant
 * with the forced sqlite:// override in tests/setup/vitest.setup.ts and
 * tests/setup/register.cjs: those can be bypassed by a future refactor, this
 * cannot without touching resetDatabase() itself.
 */
function assertDisposableSqliteDatabase(): void {
  const source = DB.getActiveSource()

  if (!(source instanceof SqliteDataSource)) {
    throw new Error(
      'resetDatabase() refused to run: the active neorm DataSource is not SqliteDataSource. ' +
        'This test suite drops core tables (users, organizations, tournaments, …) between every ' +
        'test and must only ever run against a throwaway in-memory SQLite database. Check ' +
        'DB_DRIVER/DB_URL — a real Postgres connection string must never reach this code path.'
    )
  }
}

/**
 * Drops and recreates the whole schema, then seeds the single organization
 * (id = 1) that every test relies on by default (buildTournament/createUser
 * default to organizationId = 1). The base migration only creates the schema
 * — it no longer seeds any organization data — so tests own their own
 * fixture here, same as `yarn db:seed` owns its "staging" organization for a
 * real database. Call before every test for isolation.
 */
export async function resetDatabase(): Promise<void> {
  assertDisposableSqliteDatabase()

  for (const table of TABLES) {
    await DB.execute(`DROP TABLE IF EXISTS ${table}`)
  }

  await migration.up()
  // Apply the incremental migrations too, so the harness schema matches
  // production (competitors/tournament_payments use playerIds, not userId).
  await migration002.up()

  const organization = new Organization()

  Object.assign(organization, {
    name: 'Test Org',
    domainName: 'test',
    allowedRegistrationRoles: [],
    createdAt: new Date()
  })
  await organization.save()
}

let userSeq = 0

/** Creates a throwaway user row (FK target for owners / competitors). */
export async function createUser(organizationId = 1): Promise<number> {
  userSeq++
  const user = new User()

  Object.assign(user, {
    organizationId,
    email: `user${userSeq}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.dev`,
    active: true,
    emailVerified: true,
    createdAt: new Date()
  })
  await user.save()

  return user.id
}

export interface CreateTournamentOptions {
  type: TournamentType
  scoreFormat?: ScoreFormat
  settings?: Record<string, unknown>
  discipline?: Discipline
  subDiscipline?: SubDiscipline | null
  /** Number of competitors when no explicit categories are given. */
  competitors?: number
  /**
   * Per-category competitor counts. When provided, one real category instance is
   * created per entry. When omitted, a single category (categoryId = null) holds
   * `competitors` players.
   */
  categories?: number[]
  /** Optional seed numbers, parallel to the single-category competitor list. */
  seeds?: (number | null)[]
  organizationId?: number
  startDate?: string
}

export interface BuiltTournament {
  tournament: Tournament
  categoryIds: number[]
  competitorIds: number[]
  ownerId: number
}

/** Builds a STAND_BY tournament with its category instances and competitors. */
export async function buildTournament(options: CreateTournamentOptions): Promise<BuiltTournament> {
  const organizationId = options.organizationId ?? 1
  const ownerId = await createUser(organizationId)
  const tournament = new Tournament()

  Object.assign(tournament, {
    organizationId,
    ownerId,
    name: `T-${options.type}-${Date.now()}`,
    description: null,
    status: TournamentStatus.STAND_BY,
    discipline: options.discipline ?? Discipline.PADEL,
    subDiscipline: options.subDiscipline ?? null,
    type: options.type,
    scoreFormat: options.scoreFormat ?? ScoreFormat.BASIC_COUNT,
    startDate: options.startDate ?? '2026-01-01',
    startTime: null,
    location: null,
    settings: options.settings ?? {},
    rankingSettings: null,
    createdAt: new Date(),
    updatedAt: new Date()
  })
  await tournament.save()

  const categoryIds: number[] = []
  const competitorIds: number[] = []
  const perCategory = options.categories ?? [options.competitors ?? 0]

  for (let categoryIndex = 0; categoryIndex < perCategory.length; categoryIndex++) {
    const count = perCategory[categoryIndex]
    // Use a real catalogue category when there is more than one so they are
    // treated as real categories by startTournament's pruning logic.
    let catalogueCategoryId: number | null = null

    if (perCategory.length > 1) {
      const catalogue = new Category()

      Object.assign(catalogue, {
        organizationId,
        name: `Category ${categoryIndex + 1}`,
        discipline: options.discipline ?? Discipline.PADEL,
        subDiscipline: options.subDiscipline ?? null
      })
      await catalogue.save()
      catalogueCategoryId = catalogue.id
    }

    const category = new TournamentCategory()

    Object.assign(category, {
      tournamentId: tournament.id,
      categoryId: catalogueCategoryId,
      maxCompetitors: Math.max(2, count) * 4
    })
    await category.save()
    categoryIds.push(category.id)

    for (let i = 0; i < count; i++) {
      const userId = await createUser(organizationId)
      const competitor = new Competitor()
      const seed = perCategory.length === 1 ? (options.seeds?.[i] ?? null) : null

      Object.assign(competitor, {
        tournamentCategoryId: category.id,
        playerIds: [userId],
        seedNumber: seed,
        createdAt: new Date()
      })
      await competitor.save()
      competitorIds.push(competitor.id)
    }
  }

  return { tournament, categoryIds, competitorIds, ownerId }
}

/** Reloads a tournament (without the org scope) with relations. */
export async function reloadTournament(id: number): Promise<Tournament> {
  const tournament = await Tournament.withoutGlobalScopes()
    .where('id', id)
    .with('competitors', 'rounds', 'matches')
    .first()

  if (!tournament) {
    throw new Error(`tournament ${id} not found`)
  }

  if (tournament.competitors) {
    tournament.competitors = [...tournament.competitors].sort((a, b) => a.id - b.id)
  }

  if (tournament.rounds) {
    tournament.rounds = [...tournament.rounds].sort((a, b) => a.number - b.number)
  }

  if (tournament.matches) {
    tournament.matches = [...tournament.matches].sort((a, b) => a.roundId - b.roundId || a.position - b.position)
  }

  return tournament
}

/** Starts the tournament through the real service (assigns seeds, builds round 1). */
export async function start(built: BuiltTournament): Promise<void> {
  await startTournament(built.tournament)
}

/**
 * Finalises a tournament the same way the processTournaments cron does: if every
 * round is closed with no pending match, it is finished (status FINISHED + ranking
 * points awarded). A tournament is no longer finished automatically when its last
 * match is loaded, so tests that expect a FINISHED tournament call this once the
 * play is over.
 */
export async function finalizeIfComplete(tournamentId: number): Promise<void> {
  const tournament = await Tournament.withoutGlobalScopes().where('id', tournamentId).first()

  if (tournament && (await isTournamentComplete(tournament))) {
    await finishTournament(tournament)
  }
}

export interface SetResultError extends Error {
  apiCode?: string
}

/**
 * Sets a single match result through the SAME validation + progression path the
 * /api/setMatchResult route uses (minus auth). Throws with the ApiException-style
 * code when the round is closed, the score is invalid, etc.
 */
export async function setResult(matchId: number, score: MatchScore): Promise<void> {
  const match = await Match.withoutGlobalScopes()
    .where('id', matchId)
    .with('tournamentCategory.tournament', 'round')
    .first()

  if (!match || !match.awayCompetitorIds) {
    throw Object.assign(new Error('notFound'), { apiCode: 'notFound' })
  }

  const tournament = match.tournamentCategory?.tournament ?? null

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw Object.assign(new Error('invalidStatus'), { apiCode: 'invalidStatus' })
  }

  const round = match.round ?? null

  if (!round || !round.active) {
    throw Object.assign(new Error('roundClosed'), { apiCode: 'roundClosed' })
  }

  if (!isValidScore(score, tournament.scoreFormat)) {
    throw Object.assign(new Error('invalidScore'), { apiCode: 'invalidScore' })
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
  await progressTournamentAfterResult(tournament, round)
}

// ── query helpers ─────────────────────────────────────────────────────────────

export async function getRounds(tournamentCategoryId: number): Promise<Round[]> {
  return (await Round.withoutGlobalScopes().where('tournamentCategoryId', tournamentCategoryId).get()).sort(
    (a, b) => a.number - b.number || (a.groupNumber ?? -1) - (b.groupNumber ?? -1) || a.type - b.type
  )
}

export async function getMatches(roundId: number): Promise<Match[]> {
  return (await Match.withoutGlobalScopes().where('roundId', roundId).get()).sort((a, b) => a.position - b.position)
}

/** All matches of a category instance across every round/lane. */
export async function getAllMatches(tournamentCategoryId: number): Promise<Match[]> {
  return Match.withoutGlobalScopes().where('tournamentCategoryId', tournamentCategoryId).get()
}

/** Currently active+open matches that still need a result, across all categories. */
export async function getPendingActiveMatches(categoryIds: number[]): Promise<Match[]> {
  const rounds = await Round.withoutGlobalScopes().whereIn('tournamentCategoryId', categoryIds).get()
  const activeOpen = rounds.filter((r) => r.active && r.status === RoundStatus.OPEN)
  const roundIds = activeOpen.map((r) => r.id)

  if (roundIds.length === 0) {
    return []
  }

  const matches = await Match.withoutGlobalScopes().whereIn('roundId', roundIds).get()

  return matches.filter((m) => m.status === MatchStatus.PENDING && m.awayCompetitorIds != null)
}

export async function getTournamentStatus(id: number): Promise<TournamentStatus> {
  const tournament = await Tournament.withoutGlobalScopes().where('id', id).first()

  return tournament!.status
}

// ── invariant / analysis helpers ──────────────────────────────────────────────

/** Every competitor id that appears (home or away) in a real match of a round. */
export function competitorsInMatches(matches: Match[]): number[] {
  const ids: number[] = []

  for (const match of matches) {
    ids.push(...match.homeCompetitorIds)

    if (match.awayCompetitorIds) {
      ids.push(...match.awayCompetitorIds)
    }
  }

  return ids
}

/** True when no competitor appears more than once within the same round. */
export function hasNoDoubleBooking(matches: Match[]): boolean {
  const ids = competitorsInMatches(matches)

  return new Set(ids).size === ids.length
}

/** Canonical "a-b" key for an unordered pair of single-competitor sides. */
export function pairKey(match: Match): string | null {
  if (!match.awayCompetitorIds) {
    return null
  }

  const a = [...match.homeCompetitorIds].sort((x, y) => x - y).join('+')
  const b = [...match.awayCompetitorIds].sort((x, y) => x - y).join('+')

  return [a, b].sort().join(' vs ')
}

// ── scoring helpers ───────────────────────────────────────────────────────────

/** A decisive score (home wins) for any format, used to drive flows quickly. */
export function homeWinScore(format: ScoreFormat): MatchScore {
  switch (format) {
    case ScoreFormat.BASIC_COUNT:
      return { home: 16, away: 8 }
    case ScoreFormat.THREE_SETS:
      return {
        sets: [
          { home: 6, away: 3 },
          { home: 6, away: 4 }
        ]
      }
    case ScoreFormat.TWO_SETS_SUPER_TIEBREAK:
      return {
        sets: [
          { home: 6, away: 3 },
          { home: 6, away: 4 }
        ]
      }
  }
}

/** A decisive score (away wins). */
export function awayWinScore(format: ScoreFormat): MatchScore {
  switch (format) {
    case ScoreFormat.BASIC_COUNT:
      return { home: 8, away: 16 }
    case ScoreFormat.THREE_SETS:
      return {
        sets: [
          { home: 3, away: 6 },
          { home: 4, away: 6 }
        ]
      }
    case ScoreFormat.TWO_SETS_SUPER_TIEBREAK:
      return {
        sets: [
          { home: 3, away: 6 },
          { home: 4, away: 6 }
        ]
      }
  }
}

export interface PlayOptions {
  /** Decide the winning side for a given match; default: always HOME. */
  decide?: (match: Match) => 'home' | 'away'
  /** Safety cap on the number of result-setting iterations. */
  maxIterations?: number
}

/**
 * Plays a tournament to completion by repeatedly resolving every pending active
 * match until nothing is left to play (or the tournament finishes). Returns the
 * number of matches resolved. Throws if it cannot make progress (likely a bug:
 * an active round with no resolvable matches).
 */
export async function playToCompletion(
  built: BuiltTournament,
  options: PlayOptions = {}
): Promise<{ resolved: number }> {
  const format = built.tournament.scoreFormat
  const decide = options.decide ?? (() => 'home' as const)
  const maxIterations = options.maxIterations ?? 5000
  let resolved = 0

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const status = await getTournamentStatus(built.tournament.id)

    if (status === TournamentStatus.FINISHED) {
      break
    }

    const pending = await getPendingActiveMatches(built.categoryIds)

    if (pending.length === 0) {
      // Nothing left to play → finalise it the way the cron would, then stop.
      await finalizeIfComplete(built.tournament.id)

      const stillStatus = await getTournamentStatus(built.tournament.id)

      if (stillStatus === TournamentStatus.FINISHED) {
        break
      }

      throw new Error(`playToCompletion stalled: no pending active matches but tournament status is ${stillStatus}`)
    }

    for (const match of pending) {
      const side = decide(match)
      const score = side === 'home' ? homeWinScore(format) : awayWinScore(format)

      await setResult(match.id, score)
      resolved++
    }
  }

  return { resolved }
}
