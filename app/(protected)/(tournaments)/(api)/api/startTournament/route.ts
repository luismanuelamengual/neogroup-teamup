import { requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { startTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/startTournament — sets the tournament ongoing and generates round 1. */
export const POST = withAuth(async (request, _context, userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  await startTournament(tournament, organizationId)
})
