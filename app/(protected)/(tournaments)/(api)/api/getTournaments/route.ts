import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getTournaments, TournamentOptions } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

interface GetTournamentsBody {
  name?: string
  ownedByUser?: boolean
  ownedByPlayer?: boolean
  statuses?: TournamentStatus[]
  page?: number
  pageSize?: number
}

/**
 * POST /api/getTournaments — unified tournament listing endpoint.
 *
 * Filters:
 * - `ownedByUser`  → tournaments owned by the signed-in user
 * - `ownedByPlayer` → tournaments where the signed-in user participates as a competitor
 * - `statuses`     → restrict to the given statuses (omit for all)
 * - `name`         → partial name match
 *
 * Supports server-side pagination via `page` and `pageSize`.
 */
export const POST = withAuth(async (request, _context, userId) => {
  const body = (await request.json()) as GetTournamentsBody
  const options: TournamentOptions = {
    withCompetitors: true,
    withImage: true,
    name: body.name,
    statuses: body.statuses,
    page: body.page,
    pageSize: body.pageSize
  }

  if (body.ownedByUser) {
    options.ownerId = userId
  }

  if (body.ownedByPlayer) {
    options.playerId = userId
  }

  return getTournaments(options)
})
