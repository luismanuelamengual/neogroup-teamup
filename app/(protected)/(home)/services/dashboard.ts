import { DB } from '@neogroup/neorm'
import { getSession } from '@/app/(auth)/services/auth'
import { OrganizationStatsDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import { PlayerStatsDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { getPlayerRankingSummary } from '@/app/(protected)/(rankings)/services/rankings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'
import { Tournament } from '../../(tournaments)/models/Tournament'

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

/** Aggregates player stats from every tournament they take part in. */
export async function getPlayerStats(userId: number): Promise<PlayerStatsDto> {
  const session = await getSession()
  const organizationId = session!.user.organizationId
  // EXISTS subquery: is there a competitor for this player in the outer query's category?
  const playerInCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'tournament_categories.id')
    .where((g) => g.where('competitors.userId', userId).orWhere('competitors.partnerUserId', userId))
  // EXISTS subquery variant scoped to the 'm' alias used in the matches query
  const playerInMatchCategorySubquery = DB.selectQuery('competitors')
    .whereColumn('competitors.tournamentCategoryId', 'm.tournamentCategoryId')
    .where((g) => g.where('competitors.userId', userId).orWhere('competitors.partnerUserId', userId))
  // IN subquery: distinct tournament_categories in FINISHED tournaments where player competed
  const finishedPlayerCategoryIds = DB.selectQuery('tournament_categories')
    .distinct()
    .select('tournament_categories.id')
    .innerJoin('tournaments', 'tournaments.id', 'tournament_categories.tournamentId')
    .innerJoin('competitors', 'competitors.tournamentCategoryId', 'tournament_categories.id')
    .where('tournaments.organizationId', organizationId)
    .where('tournaments.status', TournamentStatus.FINISHED)
    .where((g) => g.where('competitors.userId', userId).orWhere('competitors.partnerUserId', userId))
  const [
    tournamentRow,
    competitorRows,
    matchRows,
    podiumTournamentRows,
    podiumRoundRows,
    podiumMatchRows,
    rankingSummary
  ] = await Promise.all([
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
      .where((g) => g.where('c.userId', userId).orWhere('c.partnerUserId', userId))
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
      .where((g) => g.where('competitors.userId', userId).orWhere('competitors.partnerUserId', userId))
      .get(),

    // Q4b: rounds belonging to those finished categories
    DB.table('rounds')
      .select('id', 'tournamentCategoryId', 'number', 'type', 'status', 'settings', 'active')
      .where('tournamentCategoryId', 'IN', finishedPlayerCategoryIds)
      .get(),

    // Q4c: matches belonging to those finished categories
    DB.table('matches')
      .select(
        'id',
        'tournamentCategoryId',
        'roundId',
        'position',
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
  const roundsByCategory = new Map<number, object[]>()

  for (const row of podiumRoundRows) {
    const catId = Number(row.tournamentcategoryid)
    const settings =
      row.settings != null
        ? typeof row.settings === 'string'
          ? JSON.parse(row.settings as string)
          : row.settings
        : null

    if (!roundsByCategory.has(catId)) {
      roundsByCategory.set(catId, [])
    }

    roundsByCategory.get(catId)!.push({
      id: Number(row.id),
      tournamentCategoryId: catId,
      number: Number(row.number),
      type: Number(row.type),
      status: Number(row.status),
      active: Boolean(row.active),
      settings
    })
  }

  const matchesByCategory = new Map<number, object[]>()

  for (const row of podiumMatchRows) {
    const catId = Number(row.tournamentcategoryid)

    if (!matchesByCategory.has(catId)) {
      matchesByCategory.set(catId, [])
    }

    matchesByCategory.get(catId)!.push({
      id: Number(row.id),
      tournamentCategoryId: catId,
      roundId: Number(row.roundid),
      position: Number(row.position),
      homeCompetitorIds: toIntArray(row.homecompetitorids),
      awayCompetitorIds: row.awaycompetitorids != null ? toIntArray(row.awaycompetitorids) : null,
      score: row.score as string | null,
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
      rounds: roundsByCategory.get(categoryId) ?? [],
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
export async function getOrganizationStats(): Promise<OrganizationStatsDto> {
  const session = await getSession()
  const organizationId = session!.user.organizationId
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
      .select('c.userId AS userid', 'c.partnerUserId AS partneruserid')
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
  // Derive competitorsTotal and distinctPlayers from the competitor rows
  const players = new Set<number>()

  for (const row of competitorRows) {
    if (row.userid != null) {
      players.add(Number(row.userid))
    }

    if (row.partneruserid != null) {
      players.add(Number(row.partneruserid))
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
