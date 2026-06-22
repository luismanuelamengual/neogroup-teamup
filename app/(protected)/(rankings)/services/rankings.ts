import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { computeCategoryPlacements } from '@/app/(protected)/(rankings)/utils/placements'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { getTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { Tournament } from '../../(tournaments)/models/Tournament'

/** One year of validity for every ranking award, in milliseconds. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Grants the ranking points configured in `tournament.rankingSettings` to the
 * players of a finished tournament. One award row per player and category is
 * inserted, valid for one year from now. Only category instances mapped to a
 * catalogue category (categoryId not null) are considered — single-category
 * tournaments do not feed the ranking. Idempotent enough for a one-shot finish:
 * callers must only invoke it once, right after marking the tournament finished.
 */
export async function awardRankingPoints(tournamentId: number): Promise<void> {
  const tournament = (await getTournament({
    id: tournamentId,
    withCompetitors: true,
    withRounds: true,
    withMatches: true
  })) as unknown as Tournament | null
  const settings = tournament?.rankingSettings

  if (!tournament || !settings || !settings.points) {
    return
  }

  const competitors = tournament.competitors ?? []
  const now = new Date()
  const expirationDate = new Date(now.getTime() + ONE_YEAR_MS)

  for (const category of tournament.categories ?? []) {
    if (category.categoryId == null) {
      continue
    }

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

      const userIds = [competitor.userId, competitor.partnerUserId].filter((id): id is number => id != null)

      for (const userId of userIds) {
        const ranking = new Ranking()

        ranking.organizationId = tournament.organizationId
        ranking.categoryId = category.categoryId
        ranking.userId = userId
        ranking.points = points
        ranking.expirationDate = expirationDate
        ranking.createdAt = now
        await ranking.save()
      }
    }
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

/** Player ranking summary: total points and best position across categories. */
export async function getPlayerRankingSummary(userId: number): Promise<PlayerRankingSummary> {
  const rankings = await Ranking.get()
  // category -> (user -> summed points)
  const byCategory = new Map<number, Map<number, number>>()

  for (const ranking of rankings) {
    const users = byCategory.get(ranking.categoryId) ?? new Map<number, number>()

    users.set(ranking.userId, (users.get(ranking.userId) ?? 0) + ranking.points)
    byCategory.set(ranking.categoryId, users)
  }

  let points = 0
  let bestPosition = 0

  for (const users of byCategory.values()) {
    const playerPoints = users.get(userId)

    if (playerPoints == null) {
      continue
    }

    points += playerPoints

    let position = 1

    for (const otherPoints of users.values()) {
      if (otherPoints > playerPoints) {
        position++
      }
    }

    bestPosition = bestPosition === 0 ? position : Math.min(bestPosition, position)
  }

  return { points, bestPosition }
}

/** Organization ranking summary: total points awarded and distinct ranked players. */
export async function getOrganizationRankingSummary(): Promise<OrganizationRankingSummary> {
  const rankings = await Ranking.get()
  const players = new Set<number>()
  let pointsAwarded = 0

  for (const ranking of rankings) {
    pointsAwarded += ranking.points
    players.add(ranking.userId)
  }

  return { pointsAwarded, rankedPlayers: players.size }
}

export interface RankingBrowseOptions {
  organizationId: number
  /** Restrict to a single catalogue category. */
  categoryId?: number | null
  /** Restrict by discipline (used when no specific category is selected). */
  discipline?: Discipline | null
  /** Restrict by sub-discipline (tennis). */
  subDiscipline?: SubDiscipline | null
  page?: number
  pageSize?: number
}

/**
 * Paginated ranking board: sums every still-valid award per player for the
 * requested category (or, when none is given, for every category of the
 * requested discipline / sub-discipline) and returns the players ordered by
 * total points. Pagination is applied on the server.
 */
export async function getRankings({
  categoryId = null,
  discipline = null,
  subDiscipline = null,
  page = 1,
  pageSize = 20
}: RankingBrowseOptions): Promise<PaginatedResponse<RankingEntryDto[]>> {
  const rankings = await Ranking.with('category', 'user').get()
  const sub = subDiscipline ?? null
  const totals = new Map<number, RankingEntryDto>()

  for (const ranking of rankings) {
    const category = ranking.category

    if (categoryId != null) {
      if (ranking.categoryId !== categoryId) {
        continue
      }
    } else if (discipline != null) {
      if (!category || category.discipline !== discipline || (category.subDiscipline ?? null) !== sub) {
        continue
      }
    }

    const user = ranking.user

    if (!user) {
      continue
    }

    const existing = totals.get(ranking.userId)

    if (existing) {
      existing.points += ranking.points
    } else {
      totals.set(ranking.userId, {
        userId: ranking.userId,
        displayName: user.displayName,
        email: user.email,
        points: ranking.points
      })
    }
  }

  const ordered = [...totals.values()].sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
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
