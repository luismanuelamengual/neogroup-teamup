import { DB } from '@neogroup/neorm'
import { getSession } from '@/app/(auth)/services/auth'
import { OrganizationStatistics } from '@/app/(protected)/(home)/models/OrganizationStatistics'
import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'
import { PlayerStatistics } from '@/app/(protected)/(home)/models/PlayerStatistics'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'
import { getPlayerRankingSummary } from '@/app/(protected)/(rankings)/services/rankings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'
import { Tournament } from '../../(tournaments)/models/Tournament'

/**
 * Normalizes a raw `score` value selected via the query builder (which skips
 * entity casts) into a MatchScore-shaped object. PostgreSQL's driver returns
 * jsonb columns already parsed as a JS object; SQLite stores it as TEXT, so
 * the driver returns a JSON string that still needs parsing.
 */
function parseRawScore(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return null
    }
  }

  return value as Record<string, unknown>
}

/** Parses an INT[] (Postgres) or JSON-encoded TEXT (SQLite) array column value. */
function toIntArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map(Number)
  }

  if (typeof value === 'string') {
    try {
      return (JSON.parse(value) as unknown[]).map(Number)
    } catch {
      return []
    }
  }

  return []
}

/** Maximum age of a cached statistics row before it is considered stale (24h). */
const STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Normalizes a raw `playerIds` value selected via the query builder (which skips
 * entity casts) into a number[]. PostgreSQL returns a native JS array, SQLite a
 * JSON-encoded string.
 */
function parseRawPlayerIds(value: unknown): number[] {
  if (value == null) {
    return []
  }

  const array = Array.isArray(value)
    ? value
    : (() => {
        try {
          const parsed = JSON.parse(String(value))

          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()

  return array.map((id) => Number(id)).filter((id) => Number.isFinite(id))
}

/** Aggregates player stats from every tournament they take part in. */
async function computePlayerStats(userId: number): Promise<PlayerStatisticsDto> {
  const session = await getSession()
  const organizationId = session!.user.organizationId
  // EXISTS subquery: is there a competitor for this player in the outer query's category?
  const playerInCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'tournament_categories.id')
    .whereArrayContains('competitors.playerIds', userId)
  // EXISTS subquery variant scoped to the 'm' alias used in the matches query
  const playerInMatchCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'm.tournamentCategoryId')
    .whereArrayContains('competitors.playerIds', userId)
  // IN subquery: distinct tournament_categories in FINISHED tournaments where player competed
  const finishedPlayerCategoryIds = DB.selectQuery('tournament_categories')
    .distinct()
    .select('tournament_categories.id')
    .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
    .innerJoin('competitors', 'competitors.tournamentCategoryId', 'tournament_categories.id')
    .where('tournaments.organizationId', organizationId)
    .where('tournaments.status', TournamentStatus.FINISHED)
    .whereArrayContains('competitors.playerIds', userId)
  const [tournamentRow, competitorRows, matchRows, podiumTournamentRows, podiumMatchRows, rankingSummary] =
    await Promise.all([
      // Q1: tournament counts — distinct tournaments where the player competes
      DB.table('tournaments')
        .alias('t')
        .innerJoin('tournament_categories', 'tournament_categories.tournamentId', 't.id')
        .select(
          'COUNT(DISTINCT t.id) AS total',
          `COUNT(DISTINCT CASE WHEN t.status != ${TournamentStatus.FINISHED} THEN t.id END) AS active`
        )
        .where('t.organizationId', organizationId)
        .where({ exists: playerInCategorySubquery })
        .first(),

      // Q2: player's competitor id → tournamentCategoryId mapping
      DB.table('competitors')
        .alias('c')
        .innerJoin('tournament_categories', 'tournament_categories.id', 'c.tournamentCategoryId')
        .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
        .select('c.id AS cid', 'c.tournamentCategoryId AS catid')
        .where('tournaments.organizationId', organizationId)
        .whereArrayContains('c.playerIds', userId)
        .get(),

      // Q3: played matches in categories where player competes (for matchesPlayed / matchesWon)
      DB.table('matches')
        .alias('m')
        .innerJoin('tournament_categories', 'tournament_categories.id', 'm.tournamentCategoryId')
        .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
        .select(
          'm.tournamentCategoryId AS tcid',
          'm.homeCompetitorIds AS homeids',
          'm.awayCompetitorIds AS awayids',
          'm.winner AS winner'
        )
        .where('tournaments.organizationId', organizationId)
        .whereNotNull('m.awayCompetitorIds')
        .where('m.status', '!=', MatchStatus.PENDING)
        .where({ exists: playerInMatchCategorySubquery })
        .get(),

      // Q4a: FINISHED tournament metadata + player's competitor id per category
      DB.table('tournaments')
        .alias('t')
        .innerJoin('tournament_categories', 'tournament_categories.tournamentId', 't.id')
        .innerJoin('competitors', 'competitors.tournamentCategoryId', 'tournament_categories.id')
        .select(
          't.id AS tid',
          't.type AS ttype',
          't.scoreFormat AS scoreformat',
          't.settings AS tsettings',
          'tournament_categories.id AS catid',
          'competitors.id AS cid'
        )
        .where('t.organizationId', organizationId)
        .where('t.status', TournamentStatus.FINISHED)
        .whereArrayContains('competitors.playerIds', userId)
        .get(),

      // Q4b: matches belonging to those finished categories
      DB.table('matches')
        .select(
          'id',
          'tournamentCategoryId',
          'roundNumber',
          'type',
          'groupNumber',
          'position',
          'bracketInstance',
          'homeCompetitorIds',
          'awayCompetitorIds',
          'score',
          'status',
          'winner'
        )
        .where('tournamentCategoryId', 'IN', finishedPlayerCategoryIds)
        .get(),

      // Q5: ranking summary
      getPlayerRankingSummary(userId)
    ])
  const competitorByCategory = new Map<number, number>()

  for (const row of competitorRows) {
    competitorByCategory.set(Number(row.catid), Number(row.cid))
  }

  let matchesPlayed = 0
  let matchesWon = 0

  for (const row of matchRows) {
    const competitorId = competitorByCategory.get(Number(row.tcid))

    if (competitorId == null) {
      continue
    }

    const homeIds = toIntArray(row.homeids)
    const awayIds = toIntArray(row.awayids)
    const onHome = homeIds.includes(competitorId)
    const onAway = awayIds.includes(competitorId)

    if (!onHome && !onAway) {
      continue
    }

    matchesPlayed++

    if (Number(row.winner) === (onHome ? MatchSide.HOME : MatchSide.AWAY)) {
      matchesWon++
    }
  }

  // ── Podium stats ───────────────────────────────────────────────────────────

  // Build per-category lookups from the flat query results.
  // Note: column names from DB.table() are returned lowercase by PostgreSQL.
  const matchesByCategory = new Map<number, object[]>()

  for (const row of podiumMatchRows) {
    const catId = Number(row.tournamentcategoryid)

    if (!matchesByCategory.has(catId)) {
      matchesByCategory.set(catId, [])
    }

    matchesByCategory.get(catId)!.push({
      id: Number(row.id),
      tournamentCategoryId: catId,
      roundNumber: Number(row.roundnumber),
      type: Number(row.type),
      groupNumber: row.groupnumber != null ? Number(row.groupnumber) : null,
      position: Number(row.position),
      bracketInstance: row.bracketinstance != null ? Number(row.bracketinstance) : null,
      homeCompetitorIds: toIntArray(row.homecompetitorids),
      awayCompetitorIds: row.awaycompetitorids != null ? toIntArray(row.awaycompetitorids) : null,
      score: parseRawScore(row.score),
      status: Number(row.status),
      winner: row.winner != null ? Number(row.winner) : null
    })
  }

  // Derive competitors from match participant arrays — avoids a separate DB query
  const competitorsByCategory = new Map<number, object[]>()

  for (const [catId, catMatches] of matchesByCategory) {
    const seen = new Set<number>()
    const competitors: object[] = []

    for (const match of catMatches as Array<{ homeCompetitorIds: number[]; awayCompetitorIds: number[] | null }>) {
      for (const id of [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]) {
        if (!seen.has(id)) {
          seen.add(id)
          competitors.push({ id, tournamentCategoryId: catId })
        }
      }
    }

    competitorsByCategory.set(catId, competitors)
  }

  let titles = 0
  let podiums = 0

  for (const row of podiumTournamentRows) {
    const categoryId = Number(row.catid)
    const competitorId = Number(row.cid)
    const tournamentSettings =
      row.tsettings != null
        ? typeof row.tsettings === 'string'
          ? JSON.parse(row.tsettings as string)
          : row.tsettings
        : null
    // Reconstruct a minimal tournament-shaped object for the podium functions
    const tournamentForPodium = {
      id: Number(row.tid),
      type: Number(row.ttype),
      scoreFormat: Number(row.scoreformat),
      settings: tournamentSettings,
      competitors: competitorsByCategory.get(categoryId) ?? [],
      matches: matchesByCategory.get(categoryId) ?? []
    } as unknown as Tournament

    try {
      const podium = getPodiumCompetitorIds(tournamentForPodium, categoryId)

      if (podium[0] === competitorId) {
        titles++
      }

      if (podium.includes(competitorId)) {
        podiums++
      }
    } catch (error) {
      // A malformed tournament must not break the whole dashboard.
      // eslint-disable-next-line no-console
      console.error(`[dashboard] Failed to compute podium for tournament ${row.tid}:`, error)
    }
  }

  return {
    tournamentsPlayed: Number(tournamentRow?.total ?? 0),
    activeTournaments: Number(tournamentRow?.active ?? 0),
    matchesPlayed,
    matchesWon,
    winRate: matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0,
    titles,
    podiums,
    rankingPoints: rankingSummary.points,
    bestRankingPosition: rankingSummary.bestPosition
  }
}

/** Aggregates organization-wide stats from all tournaments in the organization. */
async function computeOrganizationStats(organizationId: number): Promise<OrganizationStatisticsDto> {
  const [tournamentRow, competitorRows, matchRow, rankingRow] = await Promise.all([
    // Q1: tournament counts with CASE-based aggregation in a single pass
    DB.table('tournaments')
      .select('COUNT(*) AS total', `SUM(CASE WHEN status = ${TournamentStatus.FINISHED} THEN 1 ELSE 0 END) AS finished`)
      .where('organizationId', organizationId)
      .first(),

    // Q2: competitor rows — used to compute competitorsTotal and distinctPlayers
    DB.table('competitors')
      .alias('c')
      .innerJoin('tournament_categories', 'tournament_categories.id', 'c.tournamentCategoryId')
      .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
      .select('c.playerIds AS playerids')
      .where('tournaments.organizationId', organizationId)
      .get(),

    // Q3: match counts with CASE-based aggregation in a single pass
    DB.table('matches')
      .alias('m')
      .innerJoin('tournament_categories', 'tournament_categories.id', 'm.tournamentCategoryId')
      .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
      .select('COUNT(*) AS total', `SUM(CASE WHEN m.status = ${MatchStatus.PENDING} THEN 1 ELSE 0 END) AS pending`)
      .where('tournaments.organizationId', organizationId)
      .whereNotNull('m.awayCompetitorIds')
      .first(),

    // Q4: ranking aggregates — mirrors Ranking model's OrganizationScope + expirationScope
    DB.table('rankings')
      .select('SUM(points) AS points', 'COUNT(DISTINCT userId) AS players')
      .where('organizationId', organizationId)
      .where('expirationDate', '>', new Date())
      .first()
  ])
  // Derive competitorsTotal and distinctPlayers from the competitor rows.
  // `playerids` comes back raw (no entity cast): a JS array on PostgreSQL,
  // a JSON-encoded string on SQLite — normalize both to a number[].
  const players = new Set<number>()

  for (const row of competitorRows) {
    for (const id of parseRawPlayerIds(row.playerids)) {
      players.add(id)
    }
  }

  const tournamentsTotal = Number(tournamentRow?.total ?? 0)
  const tournamentsFinished = Number(tournamentRow?.finished ?? 0)
  const tournamentsActive = tournamentsTotal - tournamentsFinished
  const competitorsTotal = competitorRows.length
  const distinctPlayers = players.size
  const matchesTotal = Number(matchRow?.total ?? 0)
  const matchesPending = Number(matchRow?.pending ?? 0)
  const matchesPlayed = matchesTotal - matchesPending

  return {
    tournamentsTotal,
    tournamentsActive,
    tournamentsFinished,
    competitorsTotal,
    avgCompetitors: tournamentsTotal > 0 ? Math.round((competitorsTotal / tournamentsTotal) * 10) / 10 : 0,
    distinctPlayers,
    matchesTotal,
    matchesPlayed,
    matchesPending,
    rankingPointsAwarded: Number(rankingRow?.points ?? 0),
    rankedPlayers: Number(rankingRow?.players ?? 0)
  }
}

// ── Cache layer ──────────────────────────────────────────────────────────────
// The two public entry points (getOrganizationStats / getPlayerStats) avoid the
// expensive aggregation above whenever possible. They read the pre-computed row
// from organization_statistics / player_statistics and only recompute when:
//   1. the cached row is older than STATS_CACHE_TTL_MS (24h), AND
//   2. a relevant match has been edited after the row's updatedAt.
// If either condition is not met the cached values are returned untouched.

/** Normalises a raw DB timestamp (Date | ISO string | null) into a Date or null. */
function parseTimestamp(value: unknown): Date | null {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  const date = new Date(value as string)

  return Number.isNaN(date.getTime()) ? null : date
}

/** Returns the more recent of two possibly-null dates, or null if both are null. */
function latestDate(a: Date | null, b: Date | null): Date | null {
  if (a == null) {
    return b
  }

  if (b == null) {
    return a
  }

  return a.getTime() >= b.getTime() ? a : b
}

/** Most recent `updatedAt` of any match or tournament in the organization, or null if none. */
async function getLatestOrganizationUpdateDate(organizationId: number): Promise<Date | null> {
  const [matchRow, tournamentRow] = await Promise.all([
    DB.table('matches')
      .alias('m')
      .innerJoin('tournament_categories', 'tournament_categories.id', 'm.tournamentCategoryId')
      .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
      .select('MAX(m.updatedAt) AS maxupdated')
      .where('tournaments.organizationId', organizationId)
      .first(),

    DB.table('tournaments').select('MAX(updatedAt) AS maxupdated').where('organizationId', organizationId).first()
  ])

  return latestDate(parseTimestamp(matchRow?.maxupdated), parseTimestamp(tournamentRow?.maxupdated))
}

/** Most recent `updatedAt` of any match or tournament in a category the player competes in, or null. */
async function getLatestPlayerUpdateDate(userId: number, organizationId: number): Promise<Date | null> {
  // EXISTS subquery: is the player a competitor in the match's category?
  const playerInMatchCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'm.tournamentCategoryId')
    .whereArrayContains('competitors.playerIds', userId)
  // EXISTS subquery: is the player a competitor in the tournament's category?
  const playerInTournamentCategorySubquery = DB.selectQuery('competitors')
    .innerJoin('tournament_categories', 'tournament_categories.id', 'competitors.tournamentCategoryId')
    .whereColumn('tournament_categories.tournamentId', 'tournaments.id')
    .whereArrayContains('competitors.playerIds', userId)
  const [matchRow, tournamentRow] = await Promise.all([
    DB.table('matches')
      .alias('m')
      .innerJoin('tournament_categories', 'tournament_categories.id', 'm.tournamentCategoryId')
      .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
      .select('MAX(m.updatedAt) AS maxupdated')
      .where('tournaments.organizationId', organizationId)
      .where({ exists: playerInMatchCategorySubquery })
      .first(),

    DB.table('tournaments')
      .select('MAX(updatedAt) AS maxupdated')
      .where('organizationId', organizationId)
      .where({ exists: playerInTournamentCategorySubquery })
      .first()
  ])

  return latestDate(parseTimestamp(matchRow?.maxupdated), parseTimestamp(tournamentRow?.maxupdated))
}

/** Maps a cached organization_statistics row to its serializable DTO. */
function organizationStatisticsToDto(row: OrganizationStatistics): OrganizationStatisticsDto {
  return {
    tournamentsTotal: row.tournamentsTotal,
    tournamentsActive: row.tournamentsActive,
    tournamentsFinished: row.tournamentsFinished,
    competitorsTotal: row.competitorsTotal,
    avgCompetitors: row.avgCompetitors,
    distinctPlayers: row.distinctPlayers,
    matchesTotal: row.matchesTotal,
    matchesPlayed: row.matchesPlayed,
    matchesPending: row.matchesPending,
    rankingPointsAwarded: row.rankingPointsAwarded,
    rankedPlayers: row.rankedPlayers
  }
}

/** Maps a cached player_statistics row to its serializable DTO. */
function playerStatisticsToDto(row: PlayerStatistics): PlayerStatisticsDto {
  return {
    tournamentsPlayed: row.tournamentsPlayed,
    activeTournaments: row.activeTournaments,
    matchesPlayed: row.matchesPlayed,
    matchesWon: row.matchesWon,
    winRate: row.winRate,
    titles: row.titles,
    podiums: row.podiums,
    rankingPoints: row.rankingPoints,
    bestRankingPosition: row.bestRankingPosition
  }
}

/**
 * Inserts or updates the organization_statistics cache row in a single atomic
 * statement (upsert), so concurrent requests racing to create the first row
 * never collide on the unique constraint.
 */
async function persistOrganizationStatistics(organizationId: number, stats: OrganizationStatisticsDto): Promise<void> {
  await OrganizationStatistics.upsert([{ organizationId, ...stats, updatedAt: new Date() }], 'organizationId')
}

/**
 * Inserts or updates the player_statistics cache row in a single atomic
 * statement (upsert), so concurrent requests racing to create the first row
 * never collide on the unique constraint.
 */
async function persistPlayerStatistics(playerId: number, stats: PlayerStatisticsDto): Promise<void> {
  await PlayerStatistics.upsert([{ playerId, ...stats, updatedAt: new Date() }], 'playerId')
}

/**
 * Organization-wide stats for the organizer home dashboard, served from the
 * organization_statistics cache whenever it is still valid.
 */
export async function getOrganizationStats(): Promise<OrganizationStatisticsDto> {
  const session = await getSession()
  const organizationId = session!.user.organizationId
  const cached = await OrganizationStatistics.where('organizationId', organizationId).first()

  if (cached) {
    const isFresh = Date.now() - cached.updatedAt.getTime() < STATS_CACHE_TTL_MS

    if (isFresh) {
      return organizationStatisticsToDto(cached)
    }

    // Cache is older than the TTL: only recompute if a match/tournament was edited after it.
    const lastUpdateDate = await getLatestOrganizationUpdateDate(organizationId)

    if (lastUpdateDate == null || lastUpdateDate.getTime() <= cached.updatedAt.getTime()) {
      return organizationStatisticsToDto(cached)
    }
  }

  const stats = await computeOrganizationStats(organizationId)

  await persistOrganizationStatistics(organizationId, stats)

  return stats
}

/**
 * Aggregated stats for the player home dashboard, served from the
 * player_statistics cache whenever it is still valid.
 */
export async function getPlayerStats(userId: number): Promise<PlayerStatisticsDto> {
  const session = await getSession()
  const organizationId = session!.user.organizationId
  const cached = await PlayerStatistics.where('playerId', userId).first()

  if (cached) {
    const isFresh = Date.now() - cached.updatedAt.getTime() < STATS_CACHE_TTL_MS

    if (isFresh) {
      return playerStatisticsToDto(cached)
    }

    // Cache is older than the TTL: only recompute if one of the player's matches
    // or tournaments was edited after it.
    const lastUpdateDate = await getLatestPlayerUpdateDate(userId, organizationId)

    if (lastUpdateDate == null || lastUpdateDate.getTime() <= cached.updatedAt.getTime()) {
      return playerStatisticsToDto(cached)
    }
  }

  const stats = await computePlayerStats(userId)

  await persistPlayerStatistics(userId, stats)

  return stats
}
