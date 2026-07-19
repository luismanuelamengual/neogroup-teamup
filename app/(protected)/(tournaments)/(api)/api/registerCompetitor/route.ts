import { loadManageableTournament, registerCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/registerCompetitor — registers a competitor into a category on
 * behalf of the organizer (owner, stand_by, free tournaments only).
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, tournamentCategoryId, playerIds } = (await request.json()) as {
    tournamentId: number
    tournamentCategoryId: number
    playerIds: number[]
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await registerCompetitor(
    tournament,
    Number(tournamentCategoryId),
    (playerIds ?? []).map((id) => Number(id))
  )
})
