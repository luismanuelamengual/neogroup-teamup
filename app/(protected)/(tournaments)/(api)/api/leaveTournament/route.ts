import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getTournamentCategories } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/leaveTournament — removes the signed-in user registration (stand_by only). */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { tournamentId } = (await request.json()) as { tournamentId: number }
  const tournament = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    throw new ApiException('Torneo no encontrado')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('Torneo en juego. Desregistración no permitida')
  }

  const categories = await getTournamentCategories(tournament)
  const entry = await Competitor.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  )
    .whereArrayContains('playerIds', userId)
    .first()

  if (!entry) {
    throw new ApiException('Usuario no inscripto en el torneo')
  }

  await entry.delete()
})
