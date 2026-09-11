import { DB } from '@neogroup/neorm'
import { OrganizationStatistics } from '@/app/(protected)/(home)/models/OrganizationStatistics'
import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'
import { PlayerStatistics } from '@/app/(protected)/(home)/models/PlayerStatistics'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'
import { UpcomingMatchDto } from '@/app/(protected)/(home)/models/UpcomingMatchDto'
import { getOrganizationRankingSummary, getPlayerRankingSummary } from '@/app/(protected)/(rankings)/services/rankings'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getMatches } from '@/app/(protected)/(tournaments)/services/matches'
import { isPlayableMatch } from '@/app/(protected)/(tournaments)/utils/matches'
import { todayDate } from '@/app/(protected)/(tournaments)/utils/schedule'
import { getCurrentOrganizationId } from '@/app/services/organization-context'

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
async function computePlayerStats(userId: number, organizationId: number): Promise<PlayerStatisticsDto> {
  // EXISTS subquery: is there a competitor for this player in the outer query's category?
  const playerInCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'tournament_categories.id')
    .whereArrayContains('competitors.playerIds', userId)
  // EXISTS subquery variant scoped to the 'm' alias used in the matches query
  const playerInMatchCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'm.tournamentCategoryId')
    .whereArrayContains('competitors.playerIds', userId)
  const [tournamentRow, competitorRows, matchRows, titlesRow, rankingSummary] = await Promise.all([
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
        'm.homeCompetitorId AS homeid',
        'm.awayCompetitorId AS awayid',
        'm.winner AS winner'
      )
      .where('tournaments.organizationId', organizationId)
      .whereNotNull('m.awayCompetitorId')
      .where('m.status', '!=', MatchStatus.PENDING)
      // A voided fixture keeps both its sides (see MatchStatus.VOID), so it
      // would otherwise count here as a match played and lost.
      .where('m.status', '!=', MatchStatus.VOID)
      .where({ exists: playerInMatchCategorySubquery })
      .get(),

    // Q4: titles — categories the player finished as champion. The winner is
    // settled once, when the tournament finishes (see `persistCategoryChampions`),
    // so this is a single indexed join. It used to mean pulling every match of
    // every category the player had ever finished and replaying the bracket over
    // each one of them in memory.
    DB.table('tournament_categories')
      .alias('tc')
      .innerJoin('tournaments', 'tournaments.id', 'tc.tournamentId')
      .innerJoin('competitors', 'competitors.id', 'tc.championCompetitorId')
      .select('COUNT(*) AS total')
      .where('tournaments.organizationId', organizationId)
      .whereArrayContains('competitors.playerIds', userId)
      .first(),

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

    const homeId = row.homeid != null ? Number(row.homeid) : null
    const awayId = row.awayid != null ? Number(row.awayid) : null
    const onHome = homeId === competitorId
    const onAway = awayId === competitorId

    if (!onHome && !onAway) {
      continue
    }

    matchesPlayed++

    if (Number(row.winner) === (onHome ? MatchSide.HOME : MatchSide.AWAY)) {
      matchesWon++
    }
  }

  return {
    tournamentsPlayed: Number(tournamentRow?.total ?? 0),
    activeTournaments: Number(tournamentRow?.active ?? 0),
    matchesPlayed,
    matchesWon,
    winRate: matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0,
    titles: Number(titlesRow?.total ?? 0),
    rankingPoints: rankingSummary.points,
    bestRankingPosition: rankingSummary.bestPosition
  }
}

/** Aggregates organization-wide stats from all tournaments in the organization. */
async function computeOrganizationStats(organizationId: number): Promise<OrganizationStatisticsDto> {
  const [tournamentRow, competitorRows, matchRow, rankingSummary] = await Promise.all([
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
      .whereNotNull('m.awayCompetitorId')
      // A voided fixture keeps both its sides (see MatchStatus.VOID), so it
      // would otherwise inflate both the total and the played count.
      .where('m.status', '!=', MatchStatus.VOID)
      .first(),

    // Q4: ranking aggregates — mirrors Ranking model's OrganizationScope + expirationScope
    getOrganizationRankingSummary()
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
    rankingPointsAwarded: rankingSummary.pointsAwarded,
    rankedPlayers: rankingSummary.rankedPlayers
  }
}

// ── Cache layer ──────────────────────────────────────────────────────────────
// The organization comes from the current operation's context rather than
// straight from the session (see services/organization-context.ts), so these
// entry points also work from a `withOrganization` block — which is what would
// let a cron pre-compute a cache row for an organization nobody is signed in to.
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
  const organizationId = await getCurrentOrganizationId()
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
  const organizationId = await getCurrentOrganizationId()
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

  const stats = await computePlayerStats(userId, organizationId)

  await persistPlayerStatistics(userId, stats)

  return stats
}

// ── Upcoming matches ────────────────────────────────────────────────────────
// Powers the "Tus próximos partidos" home section. Unlike the stats above,
// this is never cached: a newly published schedule (or a match dropping out of
// the window as its date passes) needs to show up on the very next load.

/** How far ahead of today the "próximos partidos" section looks. */
const UPCOMING_MATCHES_WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** `date` (a 'YYYY-MM-DD' string) advanced by `days` calendar days. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The player's own matches scheduled (a date is set) within the next
 * `UPCOMING_MATCHES_WINDOW_DAYS` days, across every ONGOING tournament they
 * compete in. Ordered soonest first.
 */
export async function getUpcomingMatches(userId: number): Promise<UpcomingMatchDto[]> {
  const organizationId = await getCurrentOrganizationId()
  const today = todayDate()
  const horizon = addDays(today, UPCOMING_MATCHES_WINDOW_DAYS)
  // The player's own competitor id per category they compete in. Competitor
  // carries no organization scope of its own (unlike Tournament/Category/Site),
  // so it is enforced explicitly through the `tournament` relation.
  const myCompetitors = await Competitor.whereArrayContains('playerIds', userId)
    .whereHas('tournament', (query) => query.where('organizationId', organizationId))
    .get()

  if (myCompetitors.length === 0) {
    return []
  }

  const myCompetitorIds = new Set(myCompetitors.map((competitor) => competitor.id))
  const matches = await getMatches({
    competitorIds: [...myCompetitorIds],
    statuses: [MatchStatus.PENDING],
    tournamentStatuses: [TournamentStatus.ONGOING],
    dateFrom: today,
    dateTo: horizon,
    withTournament: true,
    withSite: true
  })
  // A real matchup only — excludes "to be defined" bracket placeholders whose
  // rival slot is still empty.
  const playableMatches = matches.filter(isPlayableMatch)
  const opponentIdOf = (match: (typeof playableMatches)[number]): number =>
    myCompetitorIds.has(match.homeCompetitorId!) ? match.awayCompetitorId! : match.homeCompetitorId!
  const opponentIds = new Set(playableMatches.map(opponentIdOf))
  const opponents =
    opponentIds.size > 0
      ? await Competitor.whereIn('id', [...opponentIds])
          .with('players')
          .get()
      : []
  const opponentNameById = new Map(opponents.map((competitor) => [competitor.id, competitor.shortName]))

  return playableMatches.map((match) => {
    const tournament = match.tournamentCategory?.tournament ?? null
    const site = match.site ?? tournament?.site ?? null
    const opponentId = opponentIdOf(match)

    return {
      matchId: match.id,
      tournamentId: match.tournamentCategory!.tournamentId,
      tournamentName: tournament?.name ?? '',
      categoryName: match.tournamentCategory?.category?.name ?? null,
      date: match.date!,
      hour: match.hour,
      siteName: site?.name ?? null,
      opponentName: opponentNameById.get(opponentId) ?? `#${opponentId}`
    }
  })
}
