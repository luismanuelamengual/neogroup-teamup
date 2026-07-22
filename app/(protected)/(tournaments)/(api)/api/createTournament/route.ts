import { CreateTournamentInput } from '@/app/(protected)/(tournaments)/models/CreateTournamentInput'
import { createTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/createTournament — creates a new tournament in stand_by status. */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const input = (await request.json()) as CreateTournamentInput

  return createTournament(input, userId, organizationId)
})
