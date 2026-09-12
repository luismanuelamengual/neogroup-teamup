import { Category } from '@/app/(protected)/(categories)/models/Category'
import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'
import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { computeCategoryPlacements } from '@/app/(protected)/(rankings)/utils/placements'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { User } from '@/app/models/User'
import { Tournament } from '../../(tournaments)/models/Tournament'

/** One year of validity for every ranking award, in milliseconds. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Grants the ranking points configured in `tournament.rankingSettings` to the
 * players of a finished tournament. One award row per player and category is
 * inserted, valid for one year from now. Category instances without a catalogue
 * category (categoryId null, i.e. no-category tournaments) produce ranking rows
 * with categoryId null. Idempotent enough for a one-shot finish: callers must
 * only invoke it once, right after marking the tournament finished.
 *
 * Takes the tournament already hydrated with its competitors and matches
 * (`getTournament({ withCompetitors: true, withMatches: true })`) rather than an
 * id: finalisation also has to work out each category's champion off the very
 * same data, and that load is the expensive half of the whole operation — which
 * runs inside one transaction, against the Vercel cron's 10s budget.
 */
export async function awardRankingPoints(tournament: Tournament): Promise<void> {
  const settings = tournament.rankingSettings

  if (!settings || !settings.points) {
    return
  }

  const competitors = tournament.competitors ?? []
  const now = new Date()
  const expirationDate = new Date(now.getTime() + ONE_YEAR_MS)
  // Collect every award across all categories/placements and insert them in a
  // single batch statement instead of one INSERT per player.
  const awards: Record<string, unknown>[] = []

  for (const category of tournament.categories ?? []) {
    const placements = computeCategoryPlacements(tournament, category.id)

    for (const placement of placements) {
      const points = settings.points[placement.placementKey] ?? 0

      if (points <= 0) {
        continue
      }

      const competitor = competitors.find((entry) => entry.id === placement.competitorId)

      if (!competitor) {
        continue
      }

      const userIds = competitor.playerIds

      for (const userId of userIds) {
        awards.push({
          organizationId: tournament.organizationId,
          // null when the tournament has no categories (no-category mode)
          categoryId: category.categoryId ?? null,
          userId,
          points,
          expirationDate,
          createdAt: now
        })
      }
    }
  }

  if (awards.length > 0) {
    await Ranking.insert(awards)
  }
}

/** Ranking summary of a single player (for the home dashboard). */
export interface PlayerRankingSummary {
  /** Sum of every still-valid ranking point of the player. */
  points: number
  /** Best (lowest) position the player holds across any category, or 0 if unranked. */
  bestPosition: number
}

/** Ranking summary of the whole organization (for the organizer dashboard). */
export interface OrganizationRankingSummary {
  /** Sum of every still-valid ranking point in the organization. */
  pointsAwarded: number
  /** Distinct players holding at least one still-valid award. */
  rankedPlayers: number
}

/**
 * Player ranking summary: total points and best position across categories.
 *
 * Entirely aggregated in the database. It used to load every ranking row of the
 * organization and group them in JavaScript to produce two numbers, which grew
 * linearly with the whole history of awards; here the rows that cross the wire
 * are one per category the player holds points in, plus one per rival ahead of
 * them in those categories.
 *
 * Asked of the `Ranking` entity rather than of the table, so both of its global
 * scopes apply on their own: the organization of the current operation (see
 * services/organization-context.ts) and "not expired yet". That second one is
 * the reason worth stating — a ranking total that forgets to exclude expired
 * awards is wrong in a way nothing reports, and this way it cannot be forgotten.
 */
export async function getPlayerRankingSummary(userId: number): Promise<PlayerRankingSummary> {
  // The player's own still-valid points, one row per category they hold any in.
  // Through toBase() because a projection is not a row of the table: `get()`
  // would hydrate these into Rankings and drop the aggregate.
  const categoryRows = await (await Ranking.where('userId', userId).toBase())
    .select('categoryId AS catid', 'SUM(points) AS pts')
    .groupBy('categoryId')
    .get()

  if (categoryRows.length === 0) {
    return { points: 0, bestPosition: 0 }
  }

  // Position in a category is "how many rivals are ahead, plus one". Counting
  // them with a HAVING over the per-player totals keeps the result set down to
  // the players actually above this one instead of the whole category.
  const positions = await Promise.all(
    categoryRows.map(async (row) => {
      const categoryId = row.catid == null ? null : Number(row.catid)
      const playerPoints = Number(row.pts)
      const rivals = categoryId == null ? Ranking.whereNull('categoryId') : Ranking.where('categoryId', categoryId)
      const rivalsAhead = await rivals.groupBy('userId').having('SUM(points)', '>', playerPoints).count()

      return rivalsAhead + 1
    })
  )

  return {
    points: categoryRows.reduce((total, row) => total + Number(row.pts), 0),
    bestPosition: Math.min(...positions)
  }
}

/**
 * Organization-wide ranking summary: points still in circulation and how many
 * players hold them. Two aggregates, both scoped by the entity — same reasoning
 * as its per-player counterpart.
 */
export async function getOrganizationRankingSummary(): Promise<OrganizationRankingSummary> {
  const [pointsAwarded, rankedPlayers] = await Promise.all([Ranking.sum('points'), Ranking.distinct().count('userId')])

  return { pointsAwarded, rankedPlayers }
}

export interface RankingBrowseOptions {
  /** Restrict to a single catalogue category. */
  categoryId?: number | null
  /** Restrict by discipline (used when no specific category is selected). */
  discipline?: Discipline | null
  page?: number
  pageSize?: number
}

/**
 * Paginated ranking board: sums every still-valid award per player for the
 * requested category (or, when none is given, for every category of the
 * requested discipline) and returns the players ordered by total points.
 * Pagination is applied on the server.
 *
 * Scoped to the organization of the current operation by the `Ranking` entity
 * itself. It used to also declare an `organizationId` option that it never
 * read — the filtering was the scope's all along, and the parameter only made
 * the signature look like it was doing something.
 */
export async function getRankings({
  categoryId = null,
  discipline = null,
  page = 1,
  pageSize = 20
}: RankingBrowseOptions = {}): Promise<PaginatedResponse<RankingEntryDto[]>> {
  // Which awards make up this board, expressed on the Ranking entity so its own
  // scopes come along: this organization, and not expired yet.
  const board = Ranking.when(categoryId != null, (query) => query.where('categoryId', categoryId))
  // Filtering by discipline means "every category of that discipline", which the
  // catalogue answers — and `Category` is scoped to the organization too, so the
  // ids can only ever be its own. A discipline with no categories has no board,
  // and an award with no category at all is not part of one either (it belongs
  // to a tournament that defined none), which is why this narrows by id rather
  // than joining.
  const disciplineCategoryIds =
    categoryId == null && discipline != null
      ? (await Category.where('discipline', discipline).get()).map((category) => category.id)
      : null

  if (disciplineCategoryIds != null) {
    board.whereIn('categoryId', disciplineCategoryIds)
  }

  // One row per player, not one per award. This used to read every ranking row
  // of the organization and group them in JavaScript, so what crossed the wire
  // grew with the entire history of awards — forever, since every finished
  // tournament adds more. Now it grows with the number of players instead.
  //
  // Through toBase() because a projection is not a row of the table: `get()`
  // would hydrate these into Rankings and drop the aggregate.
  const totals =
    disciplineCategoryIds?.length === 0
      ? []
      : await (await board.toBase()).select('userId AS userid', 'SUM(points) AS pts').groupBy('userId').get()
  const pointsByUser = new Map(totals.map((row) => [Number(row.userid), Number(row.pts)]))
  // `displayName` is a computed getter, not a column, so the board is ordered
  // here rather than in SQL — which also keeps the accent-aware collation of
  // localeCompare, something neither Postgres nor SQLite would reproduce for
  // Spanish names on its own.
  //
  // The User scopes are deliberately left on: a deactivated or unverified
  // account drops off the board, exactly as it did when this read the players
  // through `Ranking.with('user')`.
  const players = pointsByUser.size > 0 ? await User.whereIn('id', [...pointsByUser.keys()]).get() : []
  const ordered = players
    .map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      points: pointsByUser.get(user.id) ?? 0
    }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
  const total = ordered.length
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(1, page), lastPage)
  const start = (currentPage - 1) * pageSize
  const data = ordered.slice(start, start + pageSize)

  return {
    data,
    total,
    lastPage,
    currrentPage: currentPage,
    perPage: pageSize,
    from: total === 0 ? null : start + 1,
    to: total === 0 ? null : start + data.length
  }
}
