import { getRankings } from '@/app/(protected)/(rankings)/services/rankings'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { withAuth } from '@/app/utils/api-server'

interface GetRankingsBody {
  categoryId?: number | null
  discipline?: Discipline | null
  subDiscipline?: SubDiscipline | null
  page?: number
  pageSize?: number
}

/**
 * POST /api/getRankings — paginated ranking board for the organization.
 *
 * Filters:
 * - `categoryId`    → a single catalogue category
 * - `discipline` / `subDiscipline` → every category of that discipline (when no categoryId)
 *
 * Supports server-side pagination via `page` and `pageSize` (default 20).
 */
export const POST = withAuth(async (request, _context, _userId, organizationId) => {
  const body = (await request.json()) as GetRankingsBody

  return getRankings({
    organizationId,
    categoryId: body.categoryId,
    discipline: body.discipline,
    subDiscipline: body.subDiscipline,
    page: body.page,
    pageSize: body.pageSize
  })
})
