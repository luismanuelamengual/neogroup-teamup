import { loadManageableTournament, moveCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/moveCompetitor — moves a competitor to another category (owner, stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, competitorId, tournamentCategoryId } = (await request.json()) as {
    tournamentId: number
    competitorId: number
    tournamentCategoryId: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await moveCompetitor(tournament, Number(competitorId), Number(tournamentCategoryId))
})
