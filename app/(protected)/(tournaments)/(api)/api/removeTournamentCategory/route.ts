import {
  loadManageableTournament,
  removeTournamentCategory
} from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/removeTournamentCategory — removes an empty category (owner, stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, tournamentCategoryId } = (await request.json()) as {
    tournamentId: number
    tournamentCategoryId: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await removeTournamentCategory(tournament, Number(tournamentCategoryId))
})
