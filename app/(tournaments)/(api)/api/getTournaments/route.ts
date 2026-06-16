import { getTournaments, TournamentOptions } from '@/app/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

type GetTournamentsBody =
  | { scope: 'owned'; name?: string; onlyActive?: boolean; page?: number; pageSize?: number }
  | { scope: 'active'; page?: number; pageSize?: number }
  | { scope: 'search'; name?: string; page?: number; pageSize?: number }

/**
 * POST /api/getTournaments — unified tournament listing endpoint.
 *
 * Dispatches based on `scope`:
 * - 'owned'  → tournaments owned by the signed-in user (organizer view)
 * - 'active' → tournaments where the signed-in user participates
 * - 'search' → public search of joinable/visible tournaments by name
 *
 * Supports server-side pagination via `page` and `pageSize`.
 * Returns `{ data: Tournament[], total: number }`.
 */
export const POST = withAuth(async (request, context, userId) => {
  const body = (await request.json()) as GetTournamentsBody
  const options: TournamentOptions = { withCompetitors: true, page: body.page, pageSize: body.pageSize }

  if (body.scope === 'owned') {
    options.ownerId = userId
    options.name = body.name
    options.onlyActive = body.onlyActive
  } else if (body.scope === 'active') {
    options.playerId = userId
    options.onlyActive = true
  } else if (body.scope === 'search') {
    options.name = body.name
  } else {
    throw new ApiException('invalidScope')
  }

  return getTournaments(options)
})
