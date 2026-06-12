import { getOrganizerTournaments, OrganizerTournamentFilters } from '@/app/(tournaments)/services/queries'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/list — tournaments owned by the signed-in user. */
export const POST = withAuth(async (request, context, userId) => {
  const filters = (await request.json()) as OrganizerTournamentFilters

  return getOrganizerTournaments(userId, filters)
})
