import { loadManageableTournament, registerCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/registerCompetitor — registers a competitor into a category on
 * behalf of the organizer (owner, stand_by, free tournaments only).
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, tournamentCategoryId, playerUserId, partnerUserId } = (await request.json()) as {
    tournamentId: number
    tournamentCategoryId: number
    playerUserId: number
    partnerUserId?: number | null
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await registerCompetitor(
    tournament,
    Number(tournamentCategoryId),
    Number(playerUserId),
    partnerUserId != null ? Number(partnerUserId) : null
  )
})
